# Brand Vision

Real-time vehicle brand detection from public traffic camera streams (Nevada DOT), using YOLO for detection + a custom brand classifier, with a React dashboard.

- **`frontend/`** — React + Vite dashboard (TypeScript, shadcn/ui): live stream viewer, detection charts, and history.
- **`backend/`** — FastAPI service that detects vehicle brands from live traffic camera streams using YOLO + a custom brand classifier, with WebSocket live events and SQLite stats.

## 1. General architecture
<img width="1991" height="790" alt="architecture" src="https://github.com/user-attachments/assets/bc00890c-7996-49f9-b1f0-e64357942236" />


**Key design decision**: the backend **doesn't connect directly to the cameras**. The frontend is already playing the HLS stream in a `<video>` element; it captures a frame via `<canvas>` and uploads it over the same WebSocket it uses to receive events. This avoids opening a second network connection to the camera origin per user.

This isn't just an optimization — the backend used to open its own OpenCV (`VideoCapture`) connection to each camera's HLS stream, which caused connection failures and sync drift once 2+ streams ran concurrently (network contention reconnecting to the same DOT origin). Moving frame capture to the browser removed that cap entirely: the backend no longer touches the camera network path at all, so concurrent streams no longer compete with each other over the same upstream connection.

The YOLO models are loaded **once** at process startup and shared by a single inference thread (`inference_worker`) across all active jobs — there used to be one process per job, which capped how many users could fit based on available VRAM.

## 2. Backend (`backend/`)

| File | Responsibility |
|---|---|
| `api.py` | FastAPI: REST endpoints, WebSocket, job lifecycle, shared frame queue |
| `detector.py` | Model loading, vehicle detection, brand classification, sharpness/SSIM dedup, crop extraction |
| `stats_db.py` | Persistent per-brand detection counter (SQLite, WAL) |

### Endpoints (`api.py`)

| Method | Route | Description |
|---|---|---|
| GET | `/options` | Available streams and brands (`AVAILABLE_STREAMS`, `AVAILABLE_BRANDS`) |
| GET | `/stats/brands` | Persisted historical count per brand |
| GET | `/jobs` | Active jobs: stream, brands, connected clients |
| POST | `/start` | Creates a detection job — body: `{stream, brands}` |
| POST | `/stop` | Stops a job — body: `{job_id}` |
| WS | `/ws/{job_id}` | Uploads frames (`{type: "frame", ...}`) and receives events (`status`, `match`, `detected`, `error`) |

**Concurrency limit**: `MAX_CONCURRENT_STREAMS = 10` ([backend/api.py:125](backend/api.py:125)). Once exceeded, `/start` responds `429` and the frontend shows "Currently there are too many users using the detection, please try again later."

### Job structure (`jobs: Dict[str, dict]`)

```python
jobs[job_id] = {
    "queue": event_queue,       # this job's events -> WebSocket
    "sockets": [...],           # multiple browsers can share a job
    "poller_task": ...,         # asyncio task that forwards events over WS
    "stream": "Nevada-1",
    "brands": ["tesla", "ram"],
}
```

### Detection pipeline (`detector.py`)

1. `detect_vehicles(frame, model, conf)` — YOLO detects boxes of class `car` (`VEHICLE_CLASSES`).
2. `get_crop(frame, box)` — crops the vehicle; if the crop is smaller than `MIN_CROP_SIZE=224px`, it's upscaled with bicubic interpolation.
3. `is_sharp(crop, min_sharpness)` — discards blurry crops via Laplacian variance.
4. SSIM dedup (`CROP_DEDUP_THRESHOLD=0.90`) to avoid reprocessing the same vehicle across consecutive frames.
5. `classify_crop(crop, model)` — the brand classifier (`best.engine`) returns `(label, confidence)`.
6. A `match` event is emitted and the count is persisted in `stats_db`.

### Models and inference

- **Detection**: `yolo26n.engine` (YOLO26n, class `car`).
- **Brand classification**: `best.engine` (13 brands, see `AVAILABLE_BRANDS`).
- Both are **TensorRT engines**, not `.pt` — compiled specifically for this machine's GPU/driver (RTX 3050 Laptop, driver 566.07, CUDA 12.1). **Not portable**: deploying on another GPU/driver requires re-exporting with `model.export(format="engine", device=0)`.
- `load_model(path, task)` in `detector.py` distinguishes `.pt` (calls `.to(device)`) from exported formats like `.engine`/`.mnn` (which don't support `.to()` — the device is fixed at export time).

**Reference benchmark** (RTX 3050, 4GB VRAM, `yolo26n`):

| Format | ms/img | FPS | Notes |
|---|---|---|---|
| PyTorch (.pt) | 63.75 | 15.7 | Baseline |
| MNN | 33.49 | 29.9 | No extra GPU dependencies |
| **TensorRT (batch=1, current)** | **8.05** | **124** | In production |
| TensorRT (batch=8) | 5.50/img | 182 img/s aggregate | Optimal if batched; not yet implemented |

The production engine uses **static batch=1** — it won't accept batching without re-exporting with `dynamic=True`. Batching frames (grouping frames from several streams before inference) is the identified path to scale more streams per GPU without duplicating VRAM via extra threads/models — still pending implementation in `inference_worker`.

## 3. Frontend (`frontend/src/`)

| Folder | Contents |
|---|---|
| `hooks/useVehicleDetection.tsx` | Active job state: WebSocket connection, frame uploads, error handling (offline, 429, etc.) |
| `components/brand_vision_page/` | `stream-player`, `stream-carousel`, `last-capture-panel`, `detection-history-table`, `hero_brand_vision` |
| `app/dashboard` | Dashboard layout/page |
| `types/brand-vision-page.ts` | Shared domain types |

### Relevant error handling (`useVehicleDetection.tsx`)

- Backend unreachable (fetch fails): *"vehicle detection isn't available right now."*
- Stream limit reached (`429`): *"Currently there are too many users using the detection, please try again later."*
- Other `4xx`/`5xx` errors: uses the `detail` FastAPI sends.

### History table (`detection-history-table.tsx`)

Paginates an array that's already fully loaded in memory (`match` events accumulated over WebSocket) — images are embedded as `data:image/...;base64,...` in each event, not fetched over HTTP. That's why no network cache is needed (TanStack Query wouldn't apply here: there's no fetch to cache).

## 4. Running the project

```bash
# Backend
cd backend
./venv/Scripts/python.exe -m uvicorn api:app --reload --host 0.0.0.0 --port 8000

# Frontend
cd frontend
npm run dev
```

Available streams: 4 public Nevada DOT cameras (960x540, single-variant HLS, no quality control on our side) + `test-recording` (local mp4 in `frontend/public/`, for testing without depending on the real cameras).

## 5. Known decisions and limitations

- **10 concurrent streams max**: set by config (`MAX_CONCURRENT_STREAMS`), adjustable, but the real ceiling depends on how much throughput the shared GPU can give.
- **Image quality limited by the source**: the Nevada cameras only publish 960x540 with no higher-quality variants — there's no way to request more resolution from the origin. The viable improvement is keeping the sharpest frame among several, not super-resolution.
- **TensorRT isn't portable across machines**: any deployment on another GPU requires re-exporting the `.engine` files.
- **Scaling beyond the current GPU** goes through inference batching, not more Python threads (a TensorRT `execution context` isn't thread-safe across models, and cloning the model per thread doesn't fit in 4GB of VRAM).
