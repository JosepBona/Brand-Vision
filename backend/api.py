"""
Backend that connects the React dashboard to detector.py.

Each "job" = one (stream, brands) combination running in its own
subprocess (multiprocessing.Process). Events (status, match, detected,
error) are pushed to a multiprocessing.Queue and an asyncio task forwards
them over WebSocket to every client subscribed to that job.

The backend does NOT connect to the camera stream itself. The frontend
already has the HLS <video> playing for the user, so it captures a frame
from it (canvas) every DEFAULT_INTERVAL and sends it here over the same
WebSocket - the frame the user is literally looking at, no extra network
connection to the camera origin needed. `frame_queue` (one per job) is
how that frame data crosses from this asyncio process into the detection
subprocess.

The `jobs` dict only lives in the memory of the currently running uvicorn
process. The detector runs in a fully separate multiprocessing.Process, so
if uvicorn restarts for any reason (--reload picking up a .py change, a
crash, etc.) the new process starts with an empty `jobs` dict and has no
way of knowing a detection process is still alive. Without persistence,
a POST to /stop would 404 and the detection process would be orphaned,
left running and writing to the console forever.

To avoid that:
  1. Each job is persisted to a JSON file (JOBS_REGISTRY_FILE) with its
     real PID, in addition to living in the in-memory `jobs` dict.
  2. On startup, that file is read: any PID that's still alive but not in
     the in-memory `jobs` dict is treated as orphaned and can be killed by
     PID alone, without needing the original `multiprocessing.Process`
     object.
  3. /stop first tries the normal path (Process.terminate()); if the job
     isn't in memory, it falls back to looking it up in the registry and
     killing it by PID (via psutil, which works the same on
     Windows/Linux/Mac).
  4. A FastAPI lifespan handler kills all active processes on a clean
     server shutdown (Ctrl+C, `kill -TERM`, etc.).
  5. Stopping a job pushes a "stopped" event onto the Queue to unblock the
     thread doing `queue.get()` (otherwise that thread would wait forever
     doing nothing useful).

Run with:
    uvicorn api:app --reload --host 0.0.0.0 --port 8000

NOTE: it's still best to avoid touching backend code (or to run uvicorn
without --reload) while a detection is running in tests. The on-disk
registry prevents the process from being orphaned forever, but a restart
mid-detection still interrupts it.
"""

import asyncio
import json
import logging
import multiprocessing as mp
import os
import uuid
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Dict, Optional

import psutil
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

import stats_db
from detector import (
    DEFAULT_INTERVAL,
    MARCAS_DISPONIBLES,
    STREAMS_DISPONIBLES,
    worker,
)

log = logging.getLogger("api")
logging.basicConfig(level=logging.INFO)

JOBS_REGISTRY_FILE = Path("resultados") / "jobs_registry.json"


# -- Persistent job registry (to survive uvicorn restarts) --------------------

def _load_registry() -> Dict[str, dict]:
    if not JOBS_REGISTRY_FILE.exists():
        return {}
    try:
        return json.loads(JOBS_REGISTRY_FILE.read_text(encoding="utf-8"))
    except Exception:
        log.exception("Could not read %s, ignoring.", JOBS_REGISTRY_FILE)
        return {}


def _save_registry(registry: Dict[str, dict]) -> None:
    try:
        JOBS_REGISTRY_FILE.parent.mkdir(parents=True, exist_ok=True)
        JOBS_REGISTRY_FILE.write_text(json.dumps(registry, indent=2), encoding="utf-8")
    except Exception:
        log.exception("Could not write %s", JOBS_REGISTRY_FILE)


def _registry_put(job_id: str, pid: int, stream: str, marcas: list[str]) -> None:
    registry = _load_registry()
    registry[job_id] = {"pid": pid, "stream": stream, "marcas": marcas}
    _save_registry(registry)


def _registry_remove(job_id: str) -> Optional[dict]:
    registry = _load_registry()
    entry = registry.pop(job_id, None)
    _save_registry(registry)
    return entry


def _kill_pid(pid: int) -> bool:
    """Kill a process by PID (even without the original Process object).
    Returns True if it was alive and got sent the termination signal."""
    try:
        proc = psutil.Process(pid)
    except psutil.NoSuchProcess:
        return False

    if not proc.is_running():
        return False

    try:
        proc.terminate()  # SIGTERM on POSIX, TerminateProcess on Windows
        proc.wait(timeout=5)
    except psutil.TimeoutExpired:
        log.warning("PID %d did not die after terminate(), forcing kill().", pid)
        proc.kill()
    except psutil.NoSuchProcess:
        pass
    return True


def _cleanup_orphans_on_startup() -> None:
    """On startup, check the registry: any PID still alive from a
    previous run (e.g. it survived a --reload) gets killed here, since
    there's no way to associate it with a websocket/client anymore."""
    registry = _load_registry()
    if not registry:
        return

    still_running = {}
    for job_id, entry in registry.items():
        pid = entry.get("pid")
        if pid is None:
            continue
        if _kill_pid(pid):
            log.warning(
                "Orphaned job detected on startup (job_id=%s, pid=%s, stream=%s). "
                "Likely survived a previous uvicorn restart. Killed.",
                job_id, pid, entry.get("stream"),
            )
        # removed from the registry either way (alive or already dead)
    _save_registry(still_running)  # leaves the registry empty


# -- FastAPI app ---------------------------------------------------------------

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: clean up any orphaned process from a previous run.
    _cleanup_orphans_on_startup()
    stats_db.init_db()
    yield
    # Clean shutdown (Ctrl+C, kill -TERM, etc.): kill everything still alive.
    for job_id, job in list(jobs.items()):
        if job["process"].is_alive():
            log.info("Shutting down server: terminating job %s", job_id)
            job["process"].terminate()
            job["process"].join(timeout=5)
        job["poller_task"].cancel()
        _registry_remove(job_id)


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

# Used for search.log, jobs_registry.json and stats.db - no images are
# saved to disk anymore (frames/crops travel base64-encoded inside the
# WebSocket events themselves, see detector.py), so there's nothing left
# to mount/serve as static files here.
Path("resultados").mkdir(parents=True, exist_ok=True)

jobs: Dict[str, dict] = {}
# job_id -> {"process", "queue", "frame_queue", "sockets", "poller_task",
#            "stream", "marcas"}


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
    result = {
        job_id: {
            "stream": job["stream"],
            "marcas": job["marcas"],
            "alive": job["process"].is_alive(),
            "clientes_conectados": len(job["sockets"]),
            "pid": job["process"].pid,
        }
        for job_id, job in jobs.items()
    }

    # Also report orphans that remain in the registry but are no longer in
    # memory (in case the startup cleanup missed them, e.g. because they
    # started after the last restart).
    registry = _load_registry()
    for job_id, entry in registry.items():
        if job_id in result:
            continue
        pid = entry.get("pid")
        alive = False
        if pid is not None:
            try:
                alive = psutil.Process(pid).is_running()
            except psutil.NoSuchProcess:
                alive = False
        result[job_id] = {
            "stream": entry.get("stream"),
            "marcas": entry.get("marcas"),
            "alive": alive,
            "clientes_conectados": 0,
            "pid": pid,
            "huerfano": True,
        }

    return result


async def poll_queue(job_id: str, queue: "mp.Queue") -> None:
    """Reads the Queue (blocking) in a separate thread and forwards events over WS."""
    loop = asyncio.get_event_loop()
    while True:
        event = await loop.run_in_executor(None, queue.get)
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
    queue: "mp.Queue" = mp.Queue()
    # Los frames capturados por el frontend (canvas sobre el <video>)
    # llegan aqui via WebSocket (ver ws_endpoint) y el detector los
    # consume del otro lado, en su propio proceso.
    frame_queue: "mp.Queue" = mp.Queue()

    process = mp.Process(
        target=worker,
        args=(payload.marcas, frame_queue, queue, payload.stream),
        name=f"job-{job_id}",
        daemon=True,
    )
    process.start()

    poller_task = asyncio.create_task(poll_queue(job_id, queue))

    jobs[job_id] = {
        "process": process,
        "queue": queue,
        "frame_queue": frame_queue,
        "sockets": [],
        "poller_task": poller_task,
        "stream": payload.stream,
        "marcas": payload.marcas,
    }

    # Persist the PID to disk: if uvicorn restarts while this job is still
    # alive, /stop can still find it and kill it by PID.
    _registry_put(job_id, process.pid, payload.stream, payload.marcas)

    return {"job_id": job_id, "status": "started", "stream": payload.stream, "marcas": payload.marcas}


@app.post("/stop")
async def stop_detection(payload: StopPayload | None = None, job_id: str | None = None):
    # payload comes from the normal "Stop" button (fetch with a JSON body).
    # job_id (query param) comes from navigator.sendBeacon in beforeunload
    # (F5/closing the tab): a beacon with no body avoids the CORS preflight
    # a cross-origin JSON body would require, which during an unload might
    # not complete in time, leaving the backend process orphaned.
    resolved_job_id = payload.job_id if payload is not None else job_id
    if not resolved_job_id:
        raise HTTPException(400, "job_id required")

    job = jobs.pop(resolved_job_id, None)

    if job is not None:
        # Normal path: the job is in this process's memory.
        if job["process"].is_alive():
            job["process"].terminate()
            job["process"].join(timeout=5)
            if job["process"].is_alive():
                # Shouldn't happen, but force SIGKILL just in case.
                job["process"].kill()
                job["process"].join(timeout=5)

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

        _registry_remove(resolved_job_id)
        return {"status": "stopped", "job_id": resolved_job_id}

    # Recovery path: the job isn't in memory (uvicorn probably restarted
    # via --reload while it was running). Look it up in the persistent
    # registry and kill it directly by PID.
    entry = _registry_remove(resolved_job_id)
    if entry is None or entry.get("pid") is None:
        raise HTTPException(404, "job not found")

    killed = _kill_pid(entry["pid"])
    if not killed:
        # It was already dead (e.g. someone killed it manually); still a
        # success from the user's point of view: it's not running anymore.
        return {"status": "stopped", "job_id": resolved_job_id, "note": "process was already dead"}

    return {
        "status": "stopped",
        "job_id": resolved_job_id,
        "note": "job recovered from the registry after a server restart",
    }


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
            message = await websocket.receive_text()
            try:
                data = json.loads(message)
            except (json.JSONDecodeError, TypeError):
                continue
            if isinstance(data, dict) and data.get("type") == "frame":
                image_data = data.get("image_data")
                if image_data:
                    job["frame_queue"].put(image_data)
    except WebSocketDisconnect:
        if websocket in job["sockets"]:
            job["sockets"].remove(websocket)


if __name__ == "__main__":
    # Important on Windows/macOS (spawn): this guard prevents the whole
    # module from being re-executed inside each subprocess when uvicorn
    # starts.
    import uvicorn
    uvicorn.run("api:app", host="0.0.0.0", port=8000, reload=True)
