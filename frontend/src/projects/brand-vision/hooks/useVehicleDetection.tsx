import { useCallback, useEffect, useRef, useState } from "react";

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000";
const WS_BASE = import.meta.env.VITE_WS_BASE_URL ?? "ws://localhost:8000";

// How long to wait for /options to respond before flagging the backend
// as down (see backendStatus). The sample data does NOT depend on this
// timeout - it's always loaded from the first render (see
// FALLBACK_OPTIONS/FALLBACK_BRAND_COUNTS below), regardless of whether
// the backend responds or not: they're separate responsibilities.
const BACKEND_DOWN_ALERT_MS = 2000;

// Mirror the real values from detector.py (STREAMS_DISPONIBLES /
// AVAILABLE_BRANDS): only used if the backend doesn't respond in time,
// so the UI looks just as populated as with the backend up, instead of
// showing empty lists.
const FALLBACK_STREAMS = ["Nevada-1", "Nevada-2", "Nevada-3", "test-recording", "Nevada-4"];
const FALLBACK_BRANDS = [
  "tesla", "ram", "jeep", "subaru", "toyota", "chevrolet",
  "ford", "gmc", "nissan", "lexus", "mercedes", "honda", "kia",
];
const FALLBACK_OPTIONS: DetectionOptions = {
  streams: FALLBACK_STREAMS,
  // No real URL (the backend is down, there's no stream to actually
  // play): only the names are needed so the carousel and brand selector
  // look complete. "test-recording" is the exception - it's a static
  // file served by the frontend itself (frontend/public/test-recording-v5.mp4),
  // so it keeps working even when the backend is down.
  stream_urls: {
    ...Object.fromEntries(FALLBACK_STREAMS.map((s) => [s, ""])),
    "test-recording": "/test-recording-v5.mp4",
  },
  brands: FALLBACK_BRANDS,
  capture_interval: 10,
};
const FALLBACK_BRAND_COUNTS: Record<string, number> = {
  toyota: 11,
  chevrolet: 9,
  ford: 7,
  honda: 4,
  subaru: 4,
  mercedes: 3,
  ram: 3,
  tesla: 3,
  jeep: 3,
  nissan: 2,
};

export interface DetectionOptions {
  streams: string[];
  stream_urls: Record<string, string>;
  brands: string[];
  capture_interval: number;
}

export type DetectionStatus =
  | "idle"
  | "starting"
  | "running"
  | "stopped"
  | "error";

// Different from DetectionStatus (which is the lifecycle of ONE
// detection job): this is whether the backend responds at all.
// "checking" lasts at most BACKEND_CHECK_TIMEOUT_MS from page mount.
export type BackendStatus = "checking" | "online" | "offline";

export interface DetectionEvent {
  type: "status" | "match" | "detected" | "error" | "stopped" | string;
  brand?: string;
  confidence?: number;
  timestamp?: string;
  message?: string;
  frame?: number;
  // All images travel base64-encoded directly in the event (never as a
  // path to a file served over HTTP) - see detector.py.
  frame_data?: string;
  crop_data?: string;
  image_data?: string;
  [key: string]: unknown;
}

interface StartResponse {
  job_id: string;
  status: string;
  stream: string;
  brands: string[];
}

/**
 * Hook for the dashboard: loads options (streams/brands), starts/stops
 * a detection job, and listens to real-time events over WebSocket.
 */
export function useVehicleDetection() {
  // Start already populated with sample data (not an empty state waiting
  // on a timeout): if the backend responds, it gets overwritten with the
  // real data; if not, the UI never looks empty/broken in the meantime.
  const [options, setOptions] = useState<DetectionOptions>(FALLBACK_OPTIONS);
  const [jobId, setJobId] = useState<string | null>(null);
  const [status, setStatus] = useState<DetectionStatus>("idle");
  const [backendStatus, setBackendStatus] = useState<BackendStatus>("checking");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [events, setEvents] = useState<DetectionEvent[]>([]);
  // Accumulated total per brand from ALL sessions (persisted in the
  // backend), not just the "match" events received over WebSocket in
  // this tab. Loaded once on mount; this session's matches get added
  // on top in the component that consumes this hook.
  const [persistedBrandCounts, setPersistedBrandCounts] = useState<
    Record<string, number>
  >(FALLBACK_BRAND_COUNTS);
  const wsRef = useRef<WebSocket | null>(null);
  const jobIdRef = useRef<string | null>(null);

  useEffect(() => {
    jobIdRef.current = jobId;
  }, [jobId]);

  // F5/closing tab with a job running: without this, the frontend resets
  // but the backend process stays alive indefinitely (orphaned). A normal
  // fetch in beforeunload doesn't get to complete before the browser
  // discards the page; sendBeacon is meant for exactly this.
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (!jobIdRef.current) return;
      // No body and as a query param on purpose: API_BASE is a different
      // origin (different port), and a cross-origin JSON body forces an
      // OPTIONS preflight before the real POST that may not complete in
      // time during an F5, leaving the backend process orphaned. A
      // sendBeacon with no body or custom headers is a "simple" CORS
      // request (no preflight). The backend accepts job_id as a query
      // param as a fallback specifically for this case (see /stop in
      // api.py).
      navigator.sendBeacon(
        `${API_BASE}/stop?job_id=${encodeURIComponent(jobIdRef.current)}`
      );
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, []);

  useEffect(() => {
    // This timeout has one job: flag (backendStatus) that the backend
    // isn't responding. The sample data is already set from the initial
    // state, so this doesn't touch options/brandCounts.
    const alertTimeoutId = window.setTimeout(() => {
      setBackendStatus((prev) => (prev === "online" ? prev : "offline"));
    }, BACKEND_DOWN_ALERT_MS);

    fetch(`${API_BASE}/options`)
      .then((res) => res.json())
      .then((data: DetectionOptions) => {
        window.clearTimeout(alertTimeoutId);
        setBackendStatus("online");
        setOptions(data);
      })
      .catch(() => {
        // The timeout above handles the warning; a one-off failure here
        // shouldn't tank the status of the running job.
      });

    fetch(`${API_BASE}/stats/brands`)
      .then((res) => res.json())
      .then((data: { total: number; brands: Record<string, number> }) =>
        setPersistedBrandCounts(data.brands ?? {})
      )
      .catch(() => {});

    return () => {
      window.clearTimeout(alertTimeoutId);
      wsRef.current?.close();
    };
  }, []);

  const start = useCallback(
    async (stream: string, brands: string[]) => {
      setStatus("starting");
      setErrorMessage(null);
      let res: Response;
      try {
        res = await fetch(`${API_BASE}/start`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ stream, brands }),
        });
      } catch {
        // Backend unreachable (down, network cut off, etc.): without this
        // catch the rejected fetch left the button stuck on "Starting..."
        // forever, since whoever calls start() doesn't await its promise.
        setErrorMessage("vehicle detection isn't available right now.");
        setStatus("error");
        return;
      }

      if (!res.ok) {
        if (res.status === 429) {
          setErrorMessage("Currently there are too many users using the detection, please try again later.");
          setStatus("error");
          return;
        }

        // The backend sends the detail in {"detail": "..."} (FastAPI/
        // HTTPException convention) - e.g. "stream already in use by
        // another user" (409). If there's no readable body, falls back
        // to a generic message.
        const message = await res
          .json()
          .then((body: { detail?: string }) => body.detail)
          .catch(() => undefined);
        setErrorMessage(message ?? "Could not start detection.");
        setStatus("error");
        return;
      }

      const data: StartResponse = await res.json();
      setJobId(data.job_id);
      setEvents([]);
      setStatus("running");

      const ws = new WebSocket(`${WS_BASE}/ws/${data.job_id}`);
      ws.onmessage = (evt: MessageEvent) => {
        const parsed: DetectionEvent = JSON.parse(evt.data);
        setEvents((prev) => [parsed, ...prev].slice(0, 300));
        if (parsed.type === "stopped" || parsed.type === "error") {
          setStatus(parsed.type === "error" ? "error" : "stopped");
        }
      };
      ws.onclose = () =>
        setStatus((s) => (s === "running" ? "stopped" : s));
      wsRef.current = ws;
    },
    []
  );

  // Called by StreamPlayer every time it crops a frame from the <video>
  // (canvas): it's sent to the backend over the same job WebSocket,
  // instead of the backend connecting to the stream itself. `dataUrl` is
  // what canvas.toDataURL() returns - the "data:image/jpeg;base64,"
  // prefix is stripped because the backend only needs the bytes.
  const sendFrame = useCallback((dataUrl: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      const base64 = dataUrl.split(",")[1] ?? dataUrl;
      wsRef.current.send(JSON.stringify({ type: "frame", image_data: base64 }));
    }
  }, []);

  const stop = useCallback(async () => {
    if (jobId) {
      await fetch(`${API_BASE}/stop`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ job_id: jobId }),
      });
    }
    wsRef.current?.close();
    setStatus("stopped");
    setJobId(null);
  }, [jobId]);

  const matches = events.filter((e) => e.type === "match");

  return {
    options,
    start,
    stop,
    status,
    backendStatus,
    errorMessage,
    events,
    matches,
    jobId,
    persistedBrandCounts,
    sendFrame,
  };
}