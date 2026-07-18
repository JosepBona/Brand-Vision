import base64
import logging
import threading
import time
from datetime import datetime
from pathlib import Path
from queue import Empty

import cv2
import numpy as np
from skimage.metrics import structural_similarity as ssim

import stats_db

DEFAULT_INTERVAL    = 5
DEFAULT_CONF        = 0.25
DEFAULT_DET_MODEL   = "yolo26n.pt"
DEFAULT_CLS_MARCA   = "best.pt"
IMAGE_FORMAT_FRAME  = ".jpg"
IMAGE_FORMAT_CROP   = ".png"
JPEG_QUALITY        = 90
MIN_CROP_SIZE       = 224
# SSIM threshold for crop dedup: lower than a full-frame dedup threshold
# because YOLO's bounding box is never pixel-perfect between two
# inferences of the same vehicle (1-2px jitter, stream compression, etc.),
# which already penalizes the score on a tight crop.
CROP_DEDUP_THRESHOLD = 0.90
# Side of the square canvas used to compare crops: rescaled preserving
# aspect ratio and padded (letterboxed) instead of stretched to a fixed
# rectangle, so the box jitter doesn't get misaligned any further.
SSIM_CROP_SIZE      = 240
# Minimum IoU between bounding boxes to consider them "the same vehicle"
# without relying on crop SSIM. Covers the case where YOLO detects the
# same car twice with boxes of different margins (one tight, one wider):
# the letterboxed content ends up misaligned and SSIM drops sharply
# (~0.2) even though it's literally the same vehicle in the same frame.
CROP_IOU_THRESHOLD  = 0.5
MIN_CONF_MARCA      = 0
DEFAULT_MIN_SHARPNESS = 8
VEHICLE_CLASSES     = {2: "car"}
CROP_MEMORY_SECONDS = 120

STREAMS_DISPONIBLES = {
    "Nevada-1": "https://d2wse2.its.nv.gov/renoxcd02/eaf6f95b-3055-4e9c-8def-845ac6d0aa75_hspflirxcd02_public.stream/playlist.m3u8",
    "Nevada-2": "https://d1wse3.its.nv.gov/vegasxcd03/c28c7806-930c-45ed-a698-e578390b9d38_lvflirxcd03_public.stream/playlist.m3u8",
    "Nevada-3": "https://d1wse1.its.nv.gov/vegasxcd01/e2095a9e-bdc1-4dd2-95ba-bdf4bdb11f6e_lvflirxcd01_eoc.stream/playlist.m3u8",
    # Grabacion local de prueba (frontend/public/test-recording-v5.mp4):
    # el backend nunca la toca (ya no se conecta el mismo a ningun stream
    # - ver historial), esta URL es solo la que usa el frontend para
    # cargarla en el <video>.
    "test-recording": "/test-recording-v5.mp4",
    "Nevada-4": "https://d3wse1.its.nv.gov/elkoxcd01/a3924004-7af8-4bf6-a6c2-ff8838c92ada_hspflirxcd04_public.stream/playlist.m3u8",
}

MARCAS_DISPONIBLES = [
    "tesla", "ram", "jeep", "subaru", "toyota", "chevrolet",
    "ford", "gmc", "nissan", "lexus", "mercedes", "honda", "kia"
]


# -- Logging -------------------------------------------------------------------

def setup_logging(log_path: Path) -> None:
    fmt             = logging.Formatter("%(asctime)s [%(levelname)s] %(message)s", datefmt="%Y-%m-%d %H:%M:%S")
    handler_console = logging.StreamHandler()
    handler_file    = logging.FileHandler(log_path, encoding="utf-8")
    handler_console.setFormatter(fmt)
    handler_file.setFormatter(fmt)
    root = logging.getLogger()
    root.setLevel(logging.INFO)
    root.addHandler(handler_console)
    root.addHandler(handler_file)

    status.setLevel(logging.INFO)
    status.propagate = False
    status.addHandler(handler_console)

log    = logging.getLogger(__name__)
status = logging.getLogger("status")


# -- Events to React/FastAPI ----------------------------------------------------
# Optionally pushes each event to a queue.Queue so the backend can
# forward it over WebSocket.

def emit(queue, event_type: str, **data) -> None:
    if queue is None:
        return
    try:
        queue.put({
            "type": event_type,
            "timestamp": datetime.now().isoformat(timespec="seconds"),
            **data,
        })
    except Exception:
        # never let an IPC failure take down the detection
        log.exception("No se pudo emitir evento %s", event_type)


# -- Frame decoding --------------------------------------------------------------
#
# Los frames ya NO los captura el backend conectandose el mismo al stream
# HLS (eso causaba desincronizacion con 2+ streams a la vez por
# contencion de red - ver historial de este archivo). En vez de eso, el
# frontend captura un frame del <video> que el usuario ya esta viendo
# (perfectamente sincronizado por definicion) y lo manda en base64 por el
# WebSocket; api.py lo deja en `frame_queue` y aqui solo se decodifica.

def decode_frame(image_b64: str) -> np.ndarray | None:
    try:
        raw   = base64.b64decode(image_b64)
        arr   = np.frombuffer(raw, dtype=np.uint8)
        frame = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    except Exception:
        return None
    return frame if frame is not None and frame.size > 0 else None


# -- Deduplication -------------------------------------------------------------

def prepare_crop(crop: np.ndarray) -> np.ndarray:
    """Scales the crop to grayscale preserving its aspect ratio and centers
    it on a square canvas (letterbox) instead of stretching it to a fixed
    rectangle, so YOLO's bounding box jitter doesn't misalign the SSIM
    comparison between two crops of the same vehicle."""
    gray = cv2.cvtColor(crop, cv2.COLOR_BGR2GRAY)
    h, w = gray.shape[:2]
    scale = SSIM_CROP_SIZE / max(h, w)
    resized = cv2.resize(gray, (max(1, round(w * scale)), max(1, round(h * scale))))

    canvas = np.zeros((SSIM_CROP_SIZE, SSIM_CROP_SIZE), dtype=gray.dtype)
    rh, rw = resized.shape[:2]
    y_off = (SSIM_CROP_SIZE - rh) // 2
    x_off = (SSIM_CROP_SIZE - rw) // 2
    canvas[y_off:y_off + rh, x_off:x_off + rw] = resized
    return canvas

def is_duplicate(current: np.ndarray, reference: np.ndarray | None, threshold: float) -> tuple[bool, float]:
    if reference is None:
        return False, -1.0
    score, _ = ssim(current, reference, full=True)
    return score >= threshold, score


def box_iou(box_a: tuple[int, int, int, int], box_b: tuple[int, int, int, int]) -> float:
    """IoU (Intersection over Union) between two boxes (x1, y1, x2, y2)."""
    ax1, ay1, ax2, ay2 = box_a
    bx1, by1, bx2, by2 = box_b

    ix1, iy1 = max(ax1, bx1), max(ay1, by1)
    ix2, iy2 = min(ax2, bx2), min(ay2, by2)
    inter = max(0, ix2 - ix1) * max(0, iy2 - iy1)
    if inter == 0:
        return 0.0

    area_a = max(0, ax2 - ax1) * max(0, ay2 - ay1)
    area_b = max(0, bx2 - bx1) * max(0, by2 - by1)
    union = area_a + area_b - inter
    return inter / union if union > 0 else 0.0


# -- Sharpness ----------------------------------------------------------------

def laplacian_variance(img: np.ndarray) -> float:
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY) if img.ndim == 3 else img
    return float(cv2.Laplacian(gray, cv2.CV_64F).var())

def is_sharp(crop: np.ndarray, min_sharpness: float) -> bool:
    return laplacian_variance(crop) >= min_sharpness


# -- YOLO ----------------------------------------------------------------------

def load_model(path: str):
    try:
        from ultralytics import YOLO
        import torch
    except ImportError:
        raise SystemExit("ultralytics not installed.")
    device = "cuda" if torch.cuda.is_available() else "cpu"
    model = YOLO(path)
    model.to(device)
    log.info("Model loaded: %s (device=%s)", path, device)
    return model


def detect_vehicles(frame: np.ndarray, model, conf: float) -> list:
    results = model(frame, conf=conf, verbose=False)
    boxes = []
    for box in results[0].boxes:
        if int(box.cls[0]) in VEHICLE_CLASSES:
            boxes.append(box)
    return boxes


def classify_crop(crop: np.ndarray, model) -> tuple[str, float]:
    result = model(crop, verbose=False)
    label  = result[0].names[result[0].probs.top1]
    conf   = float(result[0].probs.top1conf)
    return label, conf


def get_crop(frame: np.ndarray, box) -> np.ndarray | None:
    h, w = frame.shape[:2]
    x1, y1, x2, y2 = map(int, box.xyxy[0].tolist())
    x1, y1 = max(0, x1), max(0, y1)
    x2, y2 = min(w, x2), min(h, y2)
    crop = frame[y1:y2, x1:x2]
    if crop.size == 0:
        return None
    ch, cw = crop.shape[:2]
    if cw < MIN_CROP_SIZE or ch < MIN_CROP_SIZE:
        scale = MIN_CROP_SIZE / min(cw, ch)
        crop  = cv2.resize(crop, (int(cw * scale), int(ch * scale)), interpolation=cv2.INTER_CUBIC)
    return crop


# -- Match check ---------------------------------------------------------------

def matches_any_marca(pred_marca: str, conf_marca: float,
                      marcas: list[str]) -> tuple[bool, str]:
    """Returns (match, brand) for the first matching brand."""
    if conf_marca < MIN_CONF_MARCA:
        return False, ""
    for marca in marcas:
        if pred_marca.lower() == marca.lower():
            return True, marca
    return False, ""


# -- Image encoding (todas las imagenes viajan por WebSocket, ninguna se
#    guarda en disco) -------------------------------------------------------

def _encode_image(img: np.ndarray, fmt: str) -> str | None:
    """Codifica una imagen a base64 para mandarla directo en un evento por
    WebSocket, sin pasar por disco."""
    ok, buf = cv2.imencode(fmt, img)
    return base64.b64encode(buf).decode("ascii") if ok else None


# -- Latest frame (to show the current capture, whether or not it has vehicles) --

def save_latest_frame(frame: np.ndarray) -> str | None:
    return _encode_image(frame, IMAGE_FORMAT_FRAME)


# -- Match saving --------------------------------------------------------------

def save_match(frame: np.ndarray, crop: np.ndarray, marca: str,
               marca_conf: float, label: str, queue=None) -> None:
    log.info("MATCH ENCONTRADO | marca: %s (%.2f) | stream: %s", marca, marca_conf, label)

    stats_db.increment_brand(marca)

    emit(
        queue, "match",
        marca=marca,
        confianza=round(marca_conf, 4),
        stream=label,
        frame_data=_encode_image(frame, IMAGE_FORMAT_FRAME),
        crop_data=_encode_image(crop, IMAGE_FORMAT_CROP),
    )


# -- Detected saving -----------------------------------------------------------

def save_detected(crop: np.ndarray, marca: str, marca_conf: float, queue=None) -> None:
    emit(
        queue, "detected",
        marca=marca,
        confianza=round(marca_conf, 4),
        image_data=_encode_image(crop, IMAGE_FORMAT_CROP),
    )


def save_discarded(crop: np.ndarray, reason: str, queue=None) -> None:
    """Descarte antes de clasificar (borroso o duplicado): NO se guarda en
    disco (con muchos vehiculos por frame, esto llenaba detectados/ de
    archivos rapidamente y generaba mucho trafico HTTP hacia el frontend
    para crops que no aportan valor persistido). En cambio, el recorte
    viaja directo en el evento por WebSocket, codificado en base64, para
    que el frontend lo siga mostrando en vivo sin necesitar un archivo
    servido por HTTP."""
    ok, buf = cv2.imencode(IMAGE_FORMAT_CROP, crop)
    image_data = base64.b64encode(buf).decode("ascii") if ok else None

    emit(
        queue, "detected",
        marca=reason,
        descartado=reason,
        image_data=image_data,
    )


# -- Main detection loop ---------------------------------------------------------
#
# El frontend es quien decide cuando captura un frame (cada
# DEFAULT_INTERVAL, del <video> que el usuario ya esta viendo) y lo manda
# por WebSocket; api.py lo deposita en una `frame_queue` COMPARTIDA por
# todos los jobs activos. Un unico hilo (inference_worker) consume esa
# cola con los modelos YOLO cargados UNA sola vez, en vez de que cada job
# cargue su propia copia (antes cada job era su propio proceso con sus
# propios modelos - con una GPU de VRAM limitada, eso topaba cuantos
# usuarios podian usar la deteccion a la vez).
#
# El estado de deduplicacion (known_crops/contadores) vive por job_id, no
# por nombre de stream: asi dos usuarios viendo el mismo stream no
# comparten memoria de recortes ni contadores entre si.

_state_lock = threading.Lock()
_job_states: dict[str, dict] = {}


def _fresh_state() -> dict:
    return {"known_crops": [], "total_frames": 0, "total_matches": 0}


def register_job(job_id: str) -> None:
    """Llamado al arrancar un job: crea su estado desde cero, para que no
    arrastre memoria de recortes de un job anterior con el mismo id (no
    deberia pasar con UUIDs, pero deja el estado limpio explicitamente)."""
    with _state_lock:
        _job_states[job_id] = _fresh_state()


def remove_job(job_id: str) -> None:
    """Llamado al detener un job: libera su estado. Sin esto, cada sesion
    de deteccion dejaria una entrada huerfana en memoria para siempre."""
    with _state_lock:
        _job_states.pop(job_id, None)


def _get_job_state(job_id: str) -> dict:
    with _state_lock:
        return _job_states.setdefault(job_id, _fresh_state())


def process_frame(job_id: str, label: str, marcas: list[str], image_b64: str,
                   det_model, cls_marca_model, queue=None) -> None:
    """Decodifica un frame ya capturado por el frontend y corre deteccion +
    clasificacion sobre el, actualizando el estado de ESTE job (no del
    stream: dos jobs en el mismo stream no se pisan entre si)."""
    frame = decode_frame(image_b64)
    if frame is None:
        log.warning("[%s] Frame recibido invalido, descartado.", label)
        return

    state = _get_job_state(job_id)
    state["total_frames"] += 1
    total_frames = state["total_frames"]
    known_crops  = state["known_crops"]

    latest_frame_data = save_latest_frame(frame)
    boxes = detect_vehicles(frame, det_model, DEFAULT_CONF)

    if not boxes:
        status.info("[%s] Frame %d | sin vehiculos detectados | matches: %d",
                    label, total_frames, state["total_matches"])
        emit(queue, "status", stream=label, frame=total_frames,
             detalle="sin_vehiculos", matches=state["total_matches"],
             frame_data=latest_frame_data)
    else:
        status.info("[%s] Frame %d | %d vehiculo(s) en frame, clasificando... | matches: %d",
                    label, total_frames, len(boxes), state["total_matches"])
        emit(queue, "status", stream=label, frame=total_frames,
             detalle="clasificando", vehiculos=len(boxes), matches=state["total_matches"],
             frame_data=latest_frame_data)

    for box in boxes:
        crop = get_crop(frame, box)
        if crop is None:
            status.info("[%s] Frame %d | vehiculo descartado (recorte invalido)",
                        label, total_frames)
            continue

        if not is_sharp(crop, DEFAULT_MIN_SHARPNESS):
            status.info("[%s] Frame %d | vehiculo descartado (borroso, varianza < %.1f)",
                        label, total_frames, DEFAULT_MIN_SHARPNESS)
            save_discarded(crop, "blurry", queue=queue)
            continue

        # Deduplication on the vehicle crop (not the full frame):
        # compared against the memory of recent crops (not just
        # the immediately previous frame), so a parked vehicle
        # that YOLO misses for 1-2 frames is still recognized as
        # the same one when it reappears.
        crop_prepared = prepare_crop(crop)
        box_xyxy = tuple(map(int, box.xyxy[0].tolist()))

        match_idx, reason, score = None, "", -1.0
        for i, known in enumerate(known_crops):
            iou = box_iou(box_xyxy, known["box"])
            if iou >= CROP_IOU_THRESHOLD:
                match_idx, reason, score = i, "iou", iou
                break
            dup, ssim_score = is_duplicate(crop_prepared, known["prepared"], CROP_DEDUP_THRESHOLD)
            if dup:
                match_idx, reason, score = i, "ssim", ssim_score
                break

        if match_idx is not None:
            known_crops[match_idx]["prepared"] = crop_prepared
            known_crops[match_idx]["box"] = box_xyxy
            known_crops[match_idx]["last_seen"] = time.time()
            status.info("[%s] Frame %d | vehiculo descartado (recorte duplicado, %s %.3f)",
                        label, total_frames, reason, score)
            save_discarded(crop, "duplicate", queue=queue)
            continue

        known_crops.append({"prepared": crop_prepared, "box": box_xyxy, "last_seen": time.time()})

        pred_marca, conf_marca = classify_crop(crop, cls_marca_model)

        matched, marca = matches_any_marca(pred_marca, conf_marca, marcas)
        if matched:
            state["total_matches"] += 1
            save_match(frame, crop, marca, conf_marca, label, queue=queue)
        else:
            save_detected(crop, pred_marca, conf_marca, queue=queue)
            log.info("Detectado: %s (%.2f)", pred_marca, conf_marca)

    # Forget crops that have gone too long without reappearing, so
    # we don't compare against an ever-growing history.
    now = time.time()
    state["known_crops"] = [
        k for k in known_crops
        if now - k["last_seen"] <= CROP_MEMORY_SECONDS
    ]


def inference_worker(frame_queue, det_model, cls_marca_model,
                      stop_event: threading.Event) -> None:
    """Unico consumidor de `frame_queue`, compartido por todos los jobs
    activos. Vive durante toda la vida del servidor (se arranca una vez
    en el lifespan de FastAPI), con los modelos cargados una sola vez."""
    while not stop_event.is_set():
        try:
            item = frame_queue.get(timeout=1)
        except Empty:
            continue

        process_frame(
            job_id=item["job_id"],
            label=item["label"],
            marcas=item["marcas"],
            image_b64=item["image_b64"],
            det_model=det_model,
            cls_marca_model=cls_marca_model,
            queue=item["queue"],
        )
