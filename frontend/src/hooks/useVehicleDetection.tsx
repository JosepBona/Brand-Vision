import { useCallback, useEffect, useRef, useState } from "react";

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000";
const WS_BASE = import.meta.env.VITE_WS_BASE_URL ?? "ws://localhost:8000";

export interface DetectionOptions {
  streams: string[];
  stream_urls: Record<string, string>;
  marcas: string[];
  capture_interval: number;
}

export type DetectionStatus =
  | "idle"
  | "starting"
  | "running"
  | "stopped"
  | "error";

export interface DetectionEvent {
  type: "status" | "match" | "detected" | "error" | "stopped" | string;
  marca?: string;
  confianza?: number;
  timestamp?: string;
  message?: string;
  frame?: number;
  // Todas las imagenes viajan codificadas en base64 directo en el evento
  // (nunca como ruta a un archivo servido por HTTP) - ver detector.py.
  frame_data?: string;
  crop_data?: string;
  image_data?: string;
  [key: string]: unknown;
}

interface StartResponse {
  job_id: string;
  status: string;
  stream: string;
  marcas: string[];
}

/**
 * Hook para el dashboard: carga opciones (streams/marcas), arranca/detiene
 * un job de deteccion y escucha eventos en tiempo real por WebSocket.
 */
export function useVehicleDetection() {
  const [options, setOptions] = useState<DetectionOptions>({
    streams: [],
    stream_urls: {},
    marcas: [],
    capture_interval: 0,
  });
  const [jobId, setJobId] = useState<string | null>(null);
  const [status, setStatus] = useState<DetectionStatus>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [events, setEvents] = useState<DetectionEvent[]>([]);
  // Total acumulado por marca de TODAS las sesiones (persistido en el
  // backend), no solo de los "match" recibidos por WebSocket en esta
  // pestaña. Se carga una vez al montar; los matches de esta sesion se
  // suman encima en el componente que consume este hook.
  const [persistedBrandCounts, setPersistedBrandCounts] = useState<
    Record<string, number>
  >({});
  const wsRef = useRef<WebSocket | null>(null);
  const jobIdRef = useRef<string | null>(null);

  useEffect(() => {
    jobIdRef.current = jobId;
  }, [jobId]);

  // F5/cerrar pestaña con un job corriendo: sin esto, el frontend se resetea
  // pero el proceso del backend sigue vivo indefinidamente (huerfano). Un
  // fetch normal en beforeunload no llega a completarse antes de que el
  // navegador descarte la pagina; sendBeacon esta pensado justo para esto.
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (!jobIdRef.current) return;
      // Sin body y como query param a proposito: API_BASE es otro origen
      // (puerto distinto), y un body JSON cross-origin obliga a un
      // preflight OPTIONS antes del POST real que durante un F5 puede no
      // completarse a tiempo, dejando el proceso del backend huerfano. Un
      // sendBeacon sin body ni headers custom es una peticion CORS
      // "simple" (no preflight). El backend acepta job_id por query param
      // como fallback especifico para este caso (ver /stop en api.py).
      navigator.sendBeacon(
        `${API_BASE}/stop?job_id=${encodeURIComponent(jobIdRef.current)}`
      );
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, []);

  useEffect(() => {
    fetch(`${API_BASE}/options`)
      .then((res) => res.json())
      .then((data: DetectionOptions) => setOptions(data))
      .catch(() => setStatus("error"));

    fetch(`${API_BASE}/stats/brands`)
      .then((res) => res.json())
      .then((data: { total: number; brands: Record<string, number> }) =>
        setPersistedBrandCounts(data.brands ?? {})
      )
      .catch(() => {});

    return () => wsRef.current?.close();
  }, []);

  const start = useCallback(
    async (stream: string, marcas: string[]) => {
      setStatus("starting");
      setErrorMessage(null);
      const res = await fetch(`${API_BASE}/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stream, marcas }),
      });

      if (!res.ok) {
        // El backend manda el detalle en {"detail": "..."} (convencion de
        // FastAPI/HTTPException) - por ejemplo, "stream ya en uso por otro
        // usuario" (409). Si no hay body legible, cae a un mensaje generico.
        const message = await res
          .json()
          .then((body: { detail?: string }) => body.detail)
          .catch(() => undefined);
        setErrorMessage(message ?? "No se pudo iniciar la deteccion.");
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

  // Llamado cuando el <video> HLS del frontend realmente empieza a
  // reproducir (evento nativo "playing" en StreamPlayer): le avisa al
  // backend por el mismo WebSocket para que la primera captura del
  // detector espere a este momento en vez de dispararse a ciegas apenas
  // arranca el proceso. `loadMs` es lo que tardo el navegador en llegar a
  // ese primer frame (medido en StreamPlayer): el backend lo suma como
  // delay extra antes de capturar, para compensar el tiempo en que el
  // usuario todavia no vio nada en pantalla (ver video_ready_queue en
  // api.py/detector.py).
  const notifyVideoReady = useCallback((loadMs: number) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "video_ready", load_ms: loadMs }));
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
    errorMessage,
    events,
    matches,
    jobId,
    persistedBrandCounts,
    notifyVideoReady,
  };
}