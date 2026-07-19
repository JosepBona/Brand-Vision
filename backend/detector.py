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
DEFAULT_CLS_BRAND   = "best.pt"
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
MIN_BRAND_CONF      = 0
DEFAULT_MIN_SHARPNESS = 6
VEHICLE_CLASSES     = {2: "car"}
CROP_MEMORY_SECONDS = 120

AVAILABLE_STREAMS = {
    "Nevada-1": "https://d2wse2.its.nv.gov/renoxcd02/eaf6f95b-3055-4e9c-8def-845ac6d0aa75_hspflirxcd02_public.stream/playlist.m3u8",
    "Nevada-2": "https://d1wse3.its.nv.gov/vegasxcd03/c28c7806-930c-45ed-a698-e578390b9d38_lvflirxcd03_public.stream/playlist.m3u8",
    "Nevada-3": "https://d1wse1.its.nv.gov/vegasxcd01/e2095a9e-bdc1-4dd2-95ba-bdf4bdb11f6e_lvflirxcd01_eoc.stream/playlist.m3u8",
    # Local test recording (frontend/public/test-recording-v5.mp4):
    # the backend never touches it (it no longer connects to any stream
    # itself - see history), this URL is only what the frontend uses to
    # load it into the <video>.
    "test-recording": "/test-recording-v5.mp4",
    "Nevada-4": "https://d3wse1.its.nv.gov/elkoxcd01/a3924004-7af8-4bf6-a6c2-ff8838c92ada_hspflirxcd04_public.stream/playlist.m3u8",
}

AVAILABLE_BRANDS = [
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
        log.exception("Failed to emit event %s", event_type)


# -- Frame decoding --------------------------------------------------------------
#
# Frames are no longer captured by the backend connecting itself to the
# HLS stream (that caused desync with 2+ streams at once due to network
# contention - see this file's history). Instead, the frontend captures a
# frame from the <video> the user is already watching (perfectly synced
# by definition) and sends it as base64 over the WebSocket; api.py drops
# it into `frame_queue` and it's only decoded here.

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

def matches_any_brand(pred_brand: str, brand_conf: float,
                      brands: list[str]) -> tuple[bool, str]:
    """Returns (match, brand) for the first matching brand."""
    if brand_conf < MIN_BRAND_CONF:
        return False, ""
    for brand in brands:
        if pred_brand.lower() == brand.lower():
            return True, brand
    return False, ""


# -- Image encoding (all images travel over WebSocket, none are saved
#    to disk) -------------------------------------------------------

def _encode_image(img: np.ndarray, fmt: str) -> str | None:
    """Encodes an image to base64 to send it directly in a WebSocket
    event, without touching disk."""
    ok, buf = cv2.imencode(fmt, img)
    return base64.b64encode(buf).decode("ascii") if ok else None


# -- Latest frame (to show the current capture, whether or not it has vehicles) --

def save_latest_frame(frame: np.ndarray) -> str | None:
    return _encode_image(frame, IMAGE_FORMAT_FRAME)


# -- Match saving --------------------------------------------------------------

def save_match(frame: np.ndarray, crop: np.ndarray, brand: str,
               brand_conf: float, label: str, queue=None) -> None:
    log.info("MATCH FOUND | brand: %s (%.2f) | stream: %s", brand, brand_conf, label)

    stats_db.increment_brand(brand)

    emit(
        queue, "match",
        brand=brand,
        confidence=round(brand_conf, 4),
        stream=label,
        frame_data=_encode_image(frame, IMAGE_FORMAT_FRAME),
        crop_data=_encode_image(crop, IMAGE_FORMAT_CROP),
    )


# -- Detected saving -----------------------------------------------------------

def save_detected(crop: np.ndarray, brand: str, brand_conf: float, queue=None) -> None:
    emit(
        queue, "detected",
        brand=brand,
        confidence=round(brand_conf, 4),
        image_data=_encode_image(crop, IMAGE_FORMAT_CROP),
    )


def save_discarded(crop: np.ndarray, reason: str, queue=None) -> None:
    """Discard before classifying (blurry or duplicate): NOT saved to
    disk (with many vehicles per frame, this quickly filled detected/
    with files and generated a lot of HTTP traffic to the frontend for
    crops that add no persisted value). Instead, the crop travels
    directly in the WebSocket event, base64-encoded, so the frontend
    keeps showing it live without needing a file served over HTTP."""
    ok, buf = cv2.imencode(IMAGE_FORMAT_CROP, crop)
    image_data = base64.b64encode(buf).decode("ascii") if ok else None

    emit(
        queue, "detected",
        brand=reason,
        discarded=reason,
        image_data=image_data,
    )


# -- Main detection loop ---------------------------------------------------------
#
# The frontend decides when to capture a frame (every DEFAULT_INTERVAL,
# from the <video> the user is already watching) and sends it over
# WebSocket; api.py drops it into a `frame_queue` SHARED by all active
# jobs. A single thread (inference_worker) consumes that queue with the
# YOLO models loaded ONCE, instead of each job loading its own copy
# (previously each job was its own process with its own models - with a
# GPU of limited VRAM, that capped how many users could run detection at
# the same time).
#
# Deduplication state (known_crops/counters) lives per job_id, not per
# stream name: this way two users watching the same stream don't share
# crop memory or counters with each other.

_state_lock = threading.Lock()
_job_states: dict[str, dict] = {}


def _fresh_state() -> dict:
    return {"known_crops": [], "total_frames": 0, "total_matches": 0}


def register_job(job_id: str) -> None:
    """Called when a job starts: creates its state from scratch, so it
    doesn't carry over crop memory from a previous job with the same id
    (shouldn't happen with UUIDs, but keeps the state explicitly clean)."""
    with _state_lock:
        _job_states[job_id] = _fresh_state()


def remove_job(job_id: str) -> None:
    """Called when a job stops: frees its state. Without this, every
    detection session would leave an orphaned entry in memory forever."""
    with _state_lock:
        _job_states.pop(job_id, None)


def _get_job_state(job_id: str) -> dict:
    with _state_lock:
        return _job_states.setdefault(job_id, _fresh_state())


def process_frame(job_id: str, label: str, brands: list[str], image_b64: str,
                   det_model, cls_brand_model, queue=None) -> None:
    """Decodes a frame already captured by the frontend and runs
    detection + classification on it, updating the state of THIS job
    (not the stream: two jobs on the same stream don't step on each
    other)."""
    frame = decode_frame(image_b64)
    if frame is None:
        log.warning("[%s] Received invalid frame, discarded.", label)
        return

    state = _get_job_state(job_id)
    state["total_frames"] += 1
    total_frames = state["total_frames"]
    known_crops  = state["known_crops"]

    latest_frame_data = save_latest_frame(frame)
    boxes = detect_vehicles(frame, det_model, DEFAULT_CONF)

    if not boxes:
        status.info("[%s] Frame %d | no vehicles detected | matches: %d",
                    label, total_frames, state["total_matches"])
        emit(queue, "status", stream=label, frame=total_frames,
             detail="no_vehicles", matches=state["total_matches"],
             frame_data=latest_frame_data)
    else:
        status.info("[%s] Frame %d | %d vehicle(s) in frame, classifying... | matches: %d",
                    label, total_frames, len(boxes), state["total_matches"])
        emit(queue, "status", stream=label, frame=total_frames,
             detail="classifying", vehicles=len(boxes), matches=state["total_matches"],
             frame_data=latest_frame_data)

    for box in boxes:
        crop = get_crop(frame, box)
        if crop is None:
            status.info("[%s] Frame %d | vehicle discarded (invalid crop)",
                        label, total_frames)
            continue

        if not is_sharp(crop, DEFAULT_MIN_SHARPNESS):
            status.info("[%s] Frame %d | vehicle discarded (blurry, variance < %.1f)",
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
            status.info("[%s] Frame %d | vehicle discarded (duplicate crop, %s %.3f)",
                        label, total_frames, reason, score)
            save_discarded(crop, "duplicate", queue=queue)
            continue

        known_crops.append({"prepared": crop_prepared, "box": box_xyxy, "last_seen": time.time()})

        pred_brand, brand_conf = classify_crop(crop, cls_brand_model)

        matched, brand = matches_any_brand(pred_brand, brand_conf, brands)
        if matched:
            state["total_matches"] += 1
            save_match(frame, crop, brand, brand_conf, label, queue=queue)
        else:
            save_detected(crop, pred_brand, brand_conf, queue=queue)
            log.info("Detected: %s (%.2f)", pred_brand, brand_conf)

    # Forget crops that have gone too long without reappearing, so
    # we don't compare against an ever-growing history.
    now = time.time()
    state["known_crops"] = [
        k for k in known_crops
        if now - k["last_seen"] <= CROP_MEMORY_SECONDS
    ]


def inference_worker(frame_queue, det_model, cls_brand_model,
                      stop_event: threading.Event) -> None:
    """Sole consumer of `frame_queue`, shared by all active jobs. Lives
    for the entire lifetime of the server (started once in FastAPI's
    lifespan), with the models loaded only once."""
    while not stop_event.is_set():
        try:
            item = frame_queue.get(timeout=1)
        except Empty:
            continue

        process_frame(
            job_id=item["job_id"],
            label=item["label"],
            brands=item["brands"],
            image_b64=item["image_b64"],
            det_model=det_model,
            cls_brand_model=cls_brand_model,
            queue=item["queue"],
        )
