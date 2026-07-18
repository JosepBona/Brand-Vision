import base64
import contextlib
import logging
import multiprocessing
import os
import signal
import time
from datetime import datetime
from multiprocessing import Process
from pathlib import Path
from queue import Empty

if multiprocessing.current_process().name != "MainProcess":
    signal.signal(signal.SIGINT, signal.SIG_IGN)

import cv2
import numpy as np
from skimage.metrics import structural_similarity as ssim

import stats_db

DEFAULT_INTERVAL    = 10
# Tope de espera a que el frontend confirme que el <video> HLS ya esta
# reproduciendo antes de disparar la primera captura. Si la señal nunca
# llega (cliente cerrado, error de red en el WS, etc.) no nos quedamos
# esperando para siempre: arrancamos igual pasado este tiempo.
VIDEO_READY_TIMEOUT_SECONDS = 20
# Margen extra sobre los ms de carga reportados por el frontend: cubre el
# hueco entre "el <video> ya pinta el primer frame" y "el segmento HLS que
# se ve en pantalla ya esta realmente estable/actualizado".
EXTRA_VIDEO_SYNC_DELAY_SECONDS = 1.5
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
MAX_RETRIES         = 5
IMMEDIATE_RETRIES   = 3
IMMEDIATE_RETRY_DELAY = 3
MIN_CONF_MARCA      = 0
DEFAULT_MIN_SHARPNESS = 8
VEHICLE_CLASSES     = {2: "car"}
CROP_MEMORY_SECONDS = 120

STREAMS_DISPONIBLES = {
    "Nevada-1": "https://d2wse2.its.nv.gov/renoxcd02/eaf6f95b-3055-4e9c-8def-845ac6d0aa75_hspflirxcd02_public.stream/playlist.m3u8",
    "Nevada-2": "https://d1wse3.its.nv.gov/vegasxcd03/c28c7806-930c-45ed-a698-e578390b9d38_lvflirxcd03_public.stream/playlist.m3u8",
    "Nevada-3": "https://d1wse1.its.nv.gov/vegasxcd01/e2095a9e-bdc1-4dd2-95ba-bdf4bdb11f6e_lvflirxcd01_eoc.stream/playlist.m3u8",
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
# Optionally pushes each event to a multiprocessing.Queue so the backend
# can forward it over WebSocket.

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


# -- FFmpeg suppression --------------------------------------------------------

@contextlib.contextmanager
def suppress_ffmpeg_output():
    devnull_fd    = os.open(os.devnull, os.O_WRONLY)
    old_stderr_fd = os.dup(2)
    os.dup2(devnull_fd, 2)
    try:
        yield
    finally:
        os.dup2(old_stderr_fd, 2)
        os.close(old_stderr_fd)
        os.close(devnull_fd)


# -- Frame capture -------------------------------------------------------------

def try_capture_frame(url: str) -> np.ndarray | None:
    with suppress_ffmpeg_output():
        cap    = cv2.VideoCapture(url, cv2.CAP_FFMPEG)
        opened = cap.isOpened()
        if opened:
            for _ in range(5):
                cap.grab()
            ret, frame = cap.read()
            cap.release()
        else:
            ret, frame = False, None
    if not opened:
        return None
    if not ret or frame is None:
        return None
    return frame


def capture_frame(url: str) -> np.ndarray | None:
    for attempt in range(1, IMMEDIATE_RETRIES + 1):
        frame = try_capture_frame(url)
        if frame is not None:
            return frame
        if attempt < IMMEDIATE_RETRIES:
            time.sleep(IMMEDIATE_RETRY_DELAY)
    return None


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
    except ImportError:
        raise SystemExit("ultralytics not installed.")
    model = YOLO(path)
    log.info("Model loaded: %s", path)
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
               marca_conf: float, url: str, queue=None) -> None:
    log.info("MATCH ENCONTRADO | marca: %s (%.2f) | stream: %s", marca, marca_conf, url)

    stats_db.increment_brand(marca)

    emit(
        queue, "match",
        marca=marca,
        confianza=round(marca_conf, 4),
        stream=url,
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


# -- Interactive prompt --------------------------------------------------------
# Kept so the script can still be used by hand from the terminal.

def prompt_streams() -> list[str]:
    names = list(STREAMS_DISPONIBLES.keys())
    urls  = list(STREAMS_DISPONIBLES.values())
    print("\nSelecciona stream(s) (numeros separados por coma, ej: 1,3):")
    for i, name in enumerate(names, 1):
        print(f"  {i}. {name}")
    while True:
        raw     = input(f"stream(s) (1-{len(names)}): ").strip()
        indices = [p.strip() for p in raw.split(",")]
        if all(p.isdigit() and 1 <= int(p) <= len(names) for p in indices):
            selected = [urls[int(p) - 1] for p in indices]
            labels   = [names[int(p) - 1] for p in indices]
            print(f"  Streams seleccionados: {', '.join(labels)}")
            return selected
        print(f"  Entrada invalida. Introduce numeros entre 1 y {len(names)} separados por coma.")


def prompt_marcas() -> list[str]:
    print("\nSelecciona marca(s) (numeros separados por coma, ej: 1,3):")
    for i, marca in enumerate(MARCAS_DISPONIBLES, 1):
        print(f"  {i}. {marca}")
    while True:
        raw     = input(f"marca(s) (1-{len(MARCAS_DISPONIBLES)}): ").strip()
        indices = [p.strip() for p in raw.split(",")]
        if all(p.isdigit() and 1 <= int(p) <= len(MARCAS_DISPONIBLES) for p in indices):
            marcas = [MARCAS_DISPONIBLES[int(p) - 1] for p in indices]
            print(f"\nBuscando: {', '.join(marcas)}\n")
            return marcas
        print(f"  Entrada invalida. Introduce numeros entre 1 y {len(MARCAS_DISPONIBLES)} separados por coma.")


# -- Main search loop ----------------------------------------------------------

def stream_label(url: str) -> str:
    for name, stream_url in STREAMS_DISPONIBLES.items():
        if stream_url == url:
            return name
    return url


def run(url: str, marcas: list[str], det_model, cls_marca_model,
        queue=None, video_ready_queue=None, stagger_delay: float = 0.0) -> None:

    # Memory of recent crops (not just the last frame): each entry is
    # {"prepared": grayscale+resized crop, "last_seen": timestamp}. A
    # parked vehicle that YOLO fails to detect in a single frame
    # (occlusion, confidence just under the threshold, etc.) shouldn't be
    # counted as "new" again as soon as it reappears shortly after.
    # Measured in wall-clock time (not frame count) so CROP_MEMORY_SECONDS
    # stays accurate regardless of interval changes or capture retries.
    known_crops           = []
    consecutive_failures = 0
    total_frames         = 0
    total_matches        = 0
    start_time           = time.time()
    label                = stream_label(url)

    log.info("Buscando: %s", ", ".join(marcas))
    log.info("Stream: %s", url)
    log.info("Intervalo: %ds | Threshold SSIM recortes: %.3f | YOLO conf: %.2f", DEFAULT_INTERVAL, CROP_DEDUP_THRESHOLD, DEFAULT_CONF)
    log.info("Iniciando busqueda... (Ctrl+C para detener)\n")

    emit(queue, "started", stream=label, marcas=marcas)

    # Espera a que el frontend confirme (via WebSocket) que el <video> HLS
    # ya esta reproduciendo, para que la primera captura no ocurra antes de
    # que haya nada visible en pantalla. Si no llega a tiempo, arrancamos
    # igual: es mejor una captura desincronizada que un job que nunca hace
    # nada. El mensaje trae ademas los ms que tardo el navegador en pintar
    # ese primer frame (medidos en StreamPlayer): se suman aqui como delay
    # extra, para que la primera captura no ocurra justo en el instante en
    # que arranca el <video> sino tras el mismo margen que tardo en cargar.
    if video_ready_queue is not None:
        emit(queue, "waiting_for_video", stream=label)
        try:
            load_ms = video_ready_queue.get(timeout=VIDEO_READY_TIMEOUT_SECONDS)
        except Empty:
            load_ms = 0
        if load_ms:
            time.sleep(load_ms / 1000 + EXTRA_VIDEO_SYNC_DELAY_SECONDS)

    # Escalonado entre streams: si api.py detecto que otro stream esta a
    # punto de abrir su conexion, este espera aqui para no coincidir con
    # el (varias conexiones TCP/TLS nuevas casi al mismo instante podian
    # fallar - ver _reserve_start_slot en api.py).
    if stagger_delay > 0:
        emit(queue, "waiting_for_slot", stream=label, seconds=round(stagger_delay, 1))
        time.sleep(stagger_delay)

    try:
        while True:
            capture_start = time.time()
            frame = capture_frame(url)

            if frame is None:
                consecutive_failures += 1
                log.warning("[%s] Capture failed (%d/%d).", label, consecutive_failures, MAX_RETRIES)
                emit(queue, "capture_failed", stream=label,
                     attempt=consecutive_failures, max_retries=MAX_RETRIES)
                if consecutive_failures >= MAX_RETRIES:
                    log.error("Max retries reached. Stopping.")
                    emit(queue, "stopped", stream=label, reason="max_retries")
                    break
                time.sleep(DEFAULT_INTERVAL)
                continue

            consecutive_failures = 0
            total_frames        += 1

            latest_frame_data = save_latest_frame(frame)
            boxes = detect_vehicles(frame, det_model, DEFAULT_CONF)

            if not boxes:
                status.info("[%s] Frame %d | sin vehiculos detectados | matches: %d",
                            label, total_frames, total_matches)
                emit(queue, "status", stream=label, frame=total_frames,
                     detalle="sin_vehiculos", matches=total_matches,
                     frame_data=latest_frame_data)
            else:
                status.info("[%s] Frame %d | %d vehiculo(s) en frame, clasificando... | matches: %d",
                            label, total_frames, len(boxes), total_matches)
                emit(queue, "status", stream=label, frame=total_frames,
                     detalle="clasificando", vehiculos=len(boxes), matches=total_matches,
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
                    total_matches += 1
                    save_match(frame, crop, marca, conf_marca, url, queue=queue)
                else:
                    save_detected(crop, pred_marca, conf_marca, queue=queue)
                    log.info("Detectado: %s (%.2f)", pred_marca, conf_marca)

            # Forget crops that have gone too long without reappearing, so
            # we don't compare against an ever-growing history.
            now = time.time()
            known_crops = [
                k for k in known_crops
                if now - k["last_seen"] <= CROP_MEMORY_SECONDS
            ]

            time.sleep(max(0, DEFAULT_INTERVAL - (time.time() - capture_start)))

    except KeyboardInterrupt:
        elapsed = int(time.time() - start_time)
        log.info("Busqueda detenida. Elapsed: %ds | Frames: %d | Matches: %d",
                 elapsed, total_frames, total_matches)
        emit(queue, "stopped", stream=label, reason="keyboard_interrupt",
             frames=total_frames, matches=total_matches)


# -- Worker (subprocess) --------------------------------------------------------

def worker(url: str, marcas: list[str], queue=None, video_ready_queue=None,
           stagger_delay: float = 0.0) -> None:
    output_dir = Path("resultados")
    output_dir.mkdir(parents=True, exist_ok=True)
    setup_logging(output_dir / "search.log")

    os.environ["OPENCV_FFMPEG_CAPTURE_OPTIONS"] = (
        "loglevel;quiet"
        "|timeout;10000000"
        "|stimeout;10000000"
        "|user_agent;Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
    )

    try:
        det_model       = load_model(DEFAULT_DET_MODEL)
        cls_marca_model = load_model(DEFAULT_CLS_MARCA)
    except Exception as exc:
        emit(queue, "error", message=f"Error cargando modelos: {exc}")
        raise

    run(url, marcas, det_model, cls_marca_model, queue=queue,
        video_ready_queue=video_ready_queue, stagger_delay=stagger_delay)


# -- Entry point (manual use from the terminal) ---------------------------------

if __name__ == "__main__":
    os.environ["OPENCV_LOG_LEVEL"] = "SILENT"
    os.environ["OPENCV_FFMPEG_CAPTURE_OPTIONS"] = (
        "loglevel;quiet"
        "|timeout;10000000"
        "|stimeout;10000000"
        "|user_agent;Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
    )

    output_dir = Path("resultados")
    output_dir.mkdir(parents=True, exist_ok=True)
    setup_logging(output_dir / "search.log")
    stats_db.init_db()

    urls   = prompt_streams()
    marcas = prompt_marcas()

    if len(urls) == 1:
        det_model       = load_model(DEFAULT_DET_MODEL)
        cls_marca_model = load_model(DEFAULT_CLS_MARCA)
        run(urls[0], marcas, det_model, cls_marca_model)
    else:
        processes = [
            Process(target=worker, args=(url, marcas), name=f"stream-{i+1}")
            for i, url in enumerate(urls)
        ]

        started = []
        try:
            for i, p in enumerate(processes):
                p.start()
                started.append(p)
                if i < len(processes) - 1:
                    time.sleep(5)

            while any(p.is_alive() for p in started):
                for p in started:
                    p.join(timeout=0.5)
            log.info("All streams finished.")
        except KeyboardInterrupt:
            log.info("Stopping all streams...")
            for p in started:
                if p.is_alive():
                    p.terminate()
            for p in started:
                p.join()
            log.info("All streams stopped.")
