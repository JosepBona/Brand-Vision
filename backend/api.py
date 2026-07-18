"""
Backend that connects the React dashboard to detector.py.

Everything runs in this single process now - no more multiprocessing:
  - The frontend already has the HLS <video> playing for the user, so it
    captures a frame from it (canvas) every DEFAULT_INTERVAL and sends it
    here over the job's WebSocket - the frame the user is literally
    looking at, no extra network connection to the camera origin needed.
  - Those frames go into a single SHARED `frame_queue`, consumed by one
    background thread (detector.inference_worker) with the YOLO models
    loaded ONCE at startup. Before this, each job loaded its own copy of
    both models (one multiprocessing.Process per job), which capped how
    many people could use detection at once by whatever fit in VRAM.
  - Each job still gets its own `queue.Queue` for events (status, match,
    detected, error) forwarded over its WebSocket, and its own dedup/count
    state in detector.py (keyed by job_id, so two people watching the
    same stream don't share state).

Because there's no separate OS process per job anymore, a job can't be
"orphaned" the way it could before (a --reload restart just clears the
in-memory `jobs` dict and the shared inference thread restarts cleanly -
there's nothing left running that this process doesn't own).

Run with:
    uvicorn api:app --reload --host 0.0.0.0 --port 8000
"""

import asyncio
import json
import logging
import os
import queue as pyqueue
import threading
import uuid
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Dict

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

import stats_db
import detector
from detector import (
    DEFAULT_CLS_MARCA,
    DEFAULT_DET_MODEL,
    DEFAULT_INTERVAL,
    MARCAS_DISPONIBLES,
    STREAMS_DISPONIBLES,
    inference_worker,
    load_model,
    setup_logging,
)

log = logging.getLogger("api")
logging.basicConfig(level=logging.INFO)

# Cola compartida por TODOS los jobs activos: cada WebSocket empuja aqui
# los frames que le manda su frontend, el (unico) hilo de inferencia los
# consume con los modelos ya cargados.
frame_queue: "pyqueue.Queue" = pyqueue.Queue()
inference_stop_event = threading.Event()
inference_thread: threading.Thread | None = None


# -- FastAPI app ---------------------------------------------------------------

@asynccontextmanager
async def lifespan(app: FastAPI):
    output_dir = Path("resultados")
    output_dir.mkdir(parents=True, exist_ok=True)
    setup_logging(output_dir / "search.log")
    stats_db.init_db()

    # Los modelos se cargan UNA sola vez aqui, no por job. Un solo hilo de
    # inferencia los usa durante toda la vida del servidor.
    log.info("Cargando modelos YOLO (una sola vez, compartidos por todos los jobs)...")
    det_model       = load_model(DEFAULT_DET_MODEL)
    cls_marca_model = load_model(DEFAULT_CLS_MARCA)

    global inference_thread
    inference_thread = threading.Thread(
        target=inference_worker,
        args=(frame_queue, det_model, cls_marca_model, inference_stop_event),
        name="inference-worker",
        daemon=True,
    )
    inference_thread.start()

    yield

    # Clean shutdown (Ctrl+C, kill -TERM, etc.)
    for job_id, job in list(jobs.items()):
        job["poller_task"].cancel()
        detector.remove_job(job_id)

    inference_stop_event.set()
    if inference_thread is not None:
        inference_thread.join(timeout=5)


app = FastAPI(title="Vehicle Detection API", lifespan=lifespan)

# Frontend origin(s) allowed by CORS. Defaults to just the Vite dev port
# (5173); in production, set FRONTEND_ORIGIN to the real deployed frontend
# URL (comma-separated for multiple origins if needed).
FRONTEND_ORIGINS = [
    origin.strip()
    for origin in os.environ.get("FRONTEND_ORIGIN", "http://localhost:5173").split(",")
    if origin.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=FRONTEND_ORIGINS,
    allow_methods=["*"],
    allow_headers=["*"],
)

jobs: Dict[str, dict] = {}
# job_id -> {"queue", "sockets", "poller_task", "stream", "marcas"}


class StartPayload(BaseModel):
    stream: str
    marcas: list[str]


class StopPayload(BaseModel):
    job_id: str


@app.get("/options")
async def get_options():
    """Used to populate the stream and brand <select> elements in React."""
    return {
        "streams": list(STREAMS_DISPONIBLES.keys()),
        "stream_urls": STREAMS_DISPONIBLES,
        "marcas": MARCAS_DISPONIBLES,
        "capture_interval": DEFAULT_INTERVAL,
    }


@app.get("/stats/brands")
async def get_brand_stats():
    """Cumulative total of matches per brand (persisted in SQLite), across
    every session/person who has run a detection, not just the current
    browser session."""
    counts = stats_db.get_all_counts()
    return {"total": sum(counts.values()), "brands": counts}


@app.get("/jobs")
async def list_jobs():
    return {
        job_id: {
            "stream": job["stream"],
            "marcas": job["marcas"],
            "clientes_conectados": len(job["sockets"]),
        }
        for job_id, job in jobs.items()
    }


async def poll_queue(job_id: str, event_queue: "pyqueue.Queue") -> None:
    """Reads the Queue (blocking) in a separate thread and forwards events over WS."""
    loop = asyncio.get_event_loop()
    while True:
        event = await loop.run_in_executor(None, event_queue.get)
        job = jobs.get(job_id)
        if job is None:
            return

        dead_sockets = []
        for ws in job["sockets"]:
            try:
                await ws.send_json(event)
            except Exception:
                dead_sockets.append(ws)
        for ws in dead_sockets:
            job["sockets"].remove(ws)

        if event.get("type") == "stopped":
            return


@app.post("/start")
async def start_detection(payload: StartPayload):
    if payload.stream not in STREAMS_DISPONIBLES:
        raise HTTPException(400, f"Unknown stream: {payload.stream}")

    marcas_invalidas = set(payload.marcas) - set(MARCAS_DISPONIBLES)
    if marcas_invalidas:
        raise HTTPException(400, f"Unknown brand(s): {marcas_invalidas}")

    job_id = str(uuid.uuid4())
    event_queue: "pyqueue.Queue" = pyqueue.Queue()
    detector.register_job(job_id)

    poller_task = asyncio.create_task(poll_queue(job_id, event_queue))

    jobs[job_id] = {
        "queue": event_queue,
        "sockets": [],
        "poller_task": poller_task,
        "stream": payload.stream,
        "marcas": payload.marcas,
    }

    detector.emit(event_queue, "started", stream=payload.stream, marcas=payload.marcas)

    return {"job_id": job_id, "status": "started", "stream": payload.stream, "marcas": payload.marcas}


@app.post("/stop")
async def stop_detection(payload: StopPayload | None = None, job_id: str | None = None):
    # payload comes from the normal "Stop" button (fetch with a JSON body).
    # job_id (query param) comes from navigator.sendBeacon in beforeunload
    # (F5/closing the tab): a beacon with no body avoids the CORS preflight
    # a cross-origin JSON body would require, which during an unload might
    # not complete in time.
    resolved_job_id = payload.job_id if payload is not None else job_id
    if not resolved_job_id:
        raise HTTPException(400, "job_id required")

    job = jobs.pop(resolved_job_id, None)
    if job is None:
        raise HTTPException(404, "job not found")

    detector.remove_job(resolved_job_id)

    # Unblock the thread waiting on queue.get() and notify connected
    # clients that the job has finished.
    try:
        job["queue"].put({"type": "stopped", "reason": "stop_requested"})
    except Exception:
        pass

    job["poller_task"].cancel()

    for ws in job["sockets"]:
        try:
            await ws.close()
        except Exception:
            pass

    return {"status": "stopped", "job_id": resolved_job_id}


@app.websocket("/ws/{job_id}")
async def ws_endpoint(websocket: WebSocket, job_id: str):
    await websocket.accept()
    job = jobs.get(job_id)
    if job is None:
        await websocket.send_json({"type": "error", "message": "job not found"})
        await websocket.close()
        return

    job["sockets"].append(websocket)
    try:
        while True:
            # El frontend manda aqui cada frame que captura del <video>
            # ({"type": "frame", "image_data": "<jpeg en base64>"}), en vez
            # de que el backend se conecte el mismo al stream en directo.
            # Se deposita en la cola COMPARTIDA de inferencia, etiquetado
            # con este job_id para que su estado no se mezcle con el de
            # otros jobs (incluso si ven el mismo stream).
            message = await websocket.receive_text()
            try:
                data = json.loads(message)
            except (json.JSONDecodeError, TypeError):
                continue
            if isinstance(data, dict) and data.get("type") == "frame":
                image_data = data.get("image_data")
                if image_data:
                    frame_queue.put({
                        "job_id": job_id,
                        "label": job["stream"],
                        "marcas": job["marcas"],
                        "image_b64": image_data,
                        "queue": job["queue"],
                    })
    except WebSocketDisconnect:
        if websocket in job["sockets"]:
            job["sockets"].remove(websocket)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("api:app", host="0.0.0.0", port=8000, reload=True)
