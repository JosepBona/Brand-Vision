# Brand Vision

Detección de marca de vehículo en tiempo real a partir de cámaras públicas de tráfico (Nevada DOT), usando YOLO para detección + un clasificador propio para marca, con un dashboard en React.

- **`frontend/`** — React + Vite dashboard (TypeScript, shadcn/ui): live stream viewer, detection charts, and history.
- **`backend/`** — FastAPI service that detects vehicle brands from live traffic camera streams using YOLO + a custom brand classifier, with WebSocket live events and SQLite stats.

## 1. Arquitectura general

```
┌─────────────┐   HLS (.m3u8)   ┌──────────────────┐
│ Cámara DOT  │ ───────────────▶│  <video> (React) │
│  (Nevada)   │                 └────────┬─────────┘
└─────────────┘                          │ captura frame (canvas)
                                          │ cada DEFAULT_INTERVAL seg
                                          ▼
                              WebSocket /ws/{job_id}
                                          │
                                          ▼
                          ┌───────────────────────────┐
                          │   FastAPI (backend/api.py) │
                          │  frame_queue (compartida)  │
                          └───────────┬───────────────┘
                                      ▼
                     inference_worker (1 hilo, detector.py)
                          │                    │
                   YOLO detección (vehículo)   │
                          │                    ▼
                          ▼          clasificación de marca
                   crop del vehículo   (best.engine)
                     (yolo26n.engine)
                          │
                          ▼
              evento "match" → queue.Queue del job
                          │
                          ▼
              WebSocket → frontend (tabla + gráficos)
                          │
                          ▼
                 SQLite (resultados/stats.db)
```

**Decisión clave de diseño**: el backend **no se conecta directamente a las cámaras**. El frontend ya está reproduciendo el HLS en un `<video>`; captura un frame por `<canvas>` y lo sube por el mismo WebSocket que usa para recibir eventos. Así se evita abrir una segunda conexión de red al origen de la cámara por cada usuario.

Los modelos YOLO se cargan **una sola vez** al arrancar el proceso y los comparte un único hilo de inferencia (`inference_worker`) para todos los jobs activos — antes había un proceso por job, lo que limitaba cuántos usuarios cabían según la VRAM disponible.

## 2. Backend (`backend/`)

| Archivo | Responsabilidad |
|---|---|
| `api.py` | FastAPI: endpoints REST, WebSocket, ciclo de vida de jobs, cola compartida de frames |
| `detector.py` | Carga de modelos, detección de vehículos, clasificación de marca, dedup por nitidez/SSIM, recorte de crops |
| `stats_db.py` | Contador persistente de detecciones por marca (SQLite, WAL) |

### Endpoints (`api.py`)

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/options` | Streams y marcas disponibles (`AVAILABLE_STREAMS`, `AVAILABLE_BRANDS`) |
| GET | `/stats/brands` | Conteo histórico persistido por marca |
| GET | `/jobs` | Jobs activos: stream, marcas, clientes conectados |
| POST | `/start` | Crea un job de detección — body: `{stream, brands}` |
| POST | `/stop` | Detiene un job — body: `{job_id}` |
| WS | `/ws/{job_id}` | Sube frames (`{type: "frame", ...}`) y recibe eventos (`status`, `match`, `detected`, `error`) |

**Límite de concurrencia**: `MAX_CONCURRENT_STREAMS = 10` ([backend/api.py:125](backend/api.py:125)). Al superarse, `/start` responde `429` y el frontend muestra "Currently there are too many users using the detection, please try again later."

### Estructura de un job (`jobs: Dict[str, dict]`)

```python
jobs[job_id] = {
    "queue": event_queue,       # eventos de este job -> WebSocket
    "sockets": [...],           # varios navegadores pueden compartir un job
    "poller_task": ...,         # tarea asyncio que reenvía eventos por WS
    "stream": "Nevada-1",
    "brands": ["tesla", "ram"],
}
```

### Pipeline de detección (`detector.py`)

1. `detect_vehicles(frame, model, conf)` — YOLO detecta cajas de clase `car` (`VEHICLE_CLASSES`).
2. `get_crop(frame, box)` — recorta el vehículo; si el crop es menor a `MIN_CROP_SIZE=224px`, lo escala con interpolación bicúbica.
3. `is_sharp(crop, min_sharpness)` — descarta crops borrosos vía varianza de Laplaciano.
4. Dedup por SSIM (`CROP_DEDUP_THRESHOLD=0.90`) para no reprocesar el mismo vehículo en frames consecutivos.
5. `classify_crop(crop, model)` — clasificador de marca (`best.engine`) devuelve `(label, confidence)`.
6. Se emite el evento `match` y se persiste el conteo en `stats_db`.

### Modelos e inferencia

- **Detección**: `yolo26n.engine` (YOLO26n, clase `car`).
- **Clasificación de marca**: `best.engine` (13 marcas, ver `AVAILABLE_BRANDS`).
- Ambos son **TensorRT engines**, no `.pt` — compilados específicamente para la GPU/driver de esta máquina (RTX 3050 Laptop, driver 566.07, CUDA 12.1). **No son portables**: si se despliega en otra GPU/driver, hay que re-exportar con `model.export(format="engine", device=0)`.
- `load_model(path, task)` en `detector.py` distingue `.pt` (llama `.to(device)`) de formatos exportados como `.engine`/`.mnn` (no soportan `.to()`, el device queda fijado al exportar).

**Benchmark de referencia** (RTX 3050, 4GB VRAM, `yolo26n`):

| Formato | ms/img | FPS | Notas |
|---|---|---|---|
| PyTorch (.pt) | 63.75 | 15.7 | Baseline |
| MNN | 33.49 | 29.9 | Sin dependencias GPU extra |
| **TensorRT (batch=1, actual)** | **8.05** | **124** | En producción |
| TensorRT (batch=8) | 5.50/img | 182 img/s agregado | Óptimo si se batchea; no implementado aún |

El engine de producción usa **batch estático = 1** — no acepta batching sin volver a exportar con `dynamic=True`. El batching por lotes (agrupar frames de varios streams antes de inferir) es la vía identificada para escalar más streams por GPU sin duplicar VRAM con hilos/modelos adicionales — pendiente de implementar en `inference_worker`.

## 3. Frontend (`frontend/src/`)

| Carpeta | Contenido |
|---|---|
| `hooks/useVehicleDetection.tsx` | Estado del job activo: conexión WebSocket, envío de frames, manejo de errores (offline, 429, etc.) |
| `components/brand_vision_page/` | `stream-player`, `stream-carousel`, `last-capture-panel`, `detection-history-table`, `hero_brand_vision` |
| `app/dashboard` | Layout/página del dashboard |
| `types/brand-vision-page.ts` | Tipos compartidos del dominio |

### Manejo de errores relevantes (`useVehicleDetection.tsx`)

- Backend inalcanzable (fetch falla): *"vehicle detection isn't available right now."*
- Límite de streams alcanzado (`429`): *"Currently there are too many users using the detection, please try again later."*
- Otros errores `4xx`/`5xx`: usa el `detail` que manda FastAPI.

### Tabla de historial (`detection-history-table.tsx`)

Pagina un array ya cargado completamente en memoria (eventos `match` acumulados por WebSocket) — las imágenes van embebidas como `data:image/...;base64,...` en cada evento, no se piden por HTTP. Por eso no hace falta cache de red (TanStack Query no aplicaría: no hay fetch que cachear).

## 4. Cómo correr el proyecto

```bash
# Backend
cd backend
./venv/Scripts/python.exe -m uvicorn api:app --reload --host 0.0.0.0 --port 8000

# Frontend
cd frontend
npm run dev
```

Streams disponibles: 4 cámaras públicas del DOT de Nevada (960x540, HLS de variant único, sin control de calidad de nuestro lado) + `test-recording` (mp4 local en `frontend/public/`, para pruebas sin depender de las cámaras reales).

## 5. Decisiones y limitaciones conocidas

- **10 streams concurrentes máximo**: fijado por config (`MAX_CONCURRENT_STREAMS`), ajustable, pero el techo real depende de cuánto throughput dé la GPU compartida.
- **Calidad de imagen limitada por la fuente**: las cámaras Nevada solo publican 960x540 sin variantes de mayor calidad — no hay forma de pedir más resolución al origen. La mejora viable es quedarse con el mejor frame (mayor nitidez) entre varios, no super-resolución.
- **TensorRT no es portable entre máquinas**: cualquier despliegue en otra GPU requiere re-exportar los `.engine`.
- **Escalar más allá de la GPU actual** pasa por batching de inferencia, no por más hilos de Python (una `execution context` de TensorRT no es thread-safe entre varios modelos, y clonar el modelo por hilo no cabe en 4GB de VRAM).
