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
  frame_path?: string;
  crop_path?: string;
  message?: string;
  frame?: number;
  filename?: string;
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
      const res = await fetch(`${API_BASE}/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stream, marcas }),
      });

      if (!res.ok) {
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
  const mediaUrl = (relativePath: string) =>
    `${API_BASE}/media/${relativePath}`;
  const detectedMediaUrl = (filename: string) =>
    `${API_BASE}/detected_media/${filename}`;

  return {
    options,
    start,
    stop,
    status,
    events,
    matches,
    jobId,
    mediaUrl,
    detectedMediaUrl,
    persistedBrandCounts,
  };
}

/**
 * Ejemplo de componente de dashboard usando el hook de arriba.
 * Ajusta clases/estilos a tu UI actual.
 */
export function VehicleDetectionPanel() {
  const { options, start, stop, status, matches, mediaUrl } =
    useVehicleDetection();
  const [stream, setStream] = useState<string>("");
  const [marcas, setMarcas] = useState<string[]>([]);

  const toggleMarca = (marca: string) => {
    setMarcas((prev) =>
      prev.includes(marca) ? prev.filter((m) => m !== marca) : [...prev, marca]
    );
  };

  return (
    <div>
      <select value={stream} onChange={(e) => setStream(e.target.value)}>
        <option value="">Selecciona un stream</option>
        {options.streams.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>

      <div>
        {options.marcas.map((m) => (
          <label key={m}>
            <input
              type="checkbox"
              checked={marcas.includes(m)}
              onChange={() => toggleMarca(m)}
            />
            {m}
          </label>
        ))}
      </div>

      {status === "running" ? (
        <button onClick={stop}>Detener</button>
      ) : (
        <button
          disabled={!stream || marcas.length === 0}
          onClick={() => start(stream, marcas)}
        >
          Iniciar deteccion
        </button>
      )}

      <p>Estado: {status}</p>

      <ul>
        {matches.map((m, i) => (
          <li key={i}>
            <strong>{m.marca}</strong> ({((m.confianza ?? 0) * 100).toFixed(0)}
            %) — {m.timestamp}
            <br />
            <img
              src={mediaUrl(m.crop_path ?? "")}
              alt={m.marca}
              width={150}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}