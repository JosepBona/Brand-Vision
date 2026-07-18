import { useCallback, useEffect, useRef, useState } from "react";

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000";
const WS_BASE = import.meta.env.VITE_WS_BASE_URL ?? "ws://localhost:8000";

// Cuanto esperar a que /options responda antes de avisar que el backend
// esta caido (ver backendStatus). Los datos de muestra NO dependen de
// este timeout - se cargan siempre desde el primer render (ver
// FALLBACK_OPTIONS/FALLBACK_BRAND_COUNTS mas abajo), independientemente
// de si el backend responde o no: son responsabilidades separadas.
const BACKEND_DOWN_ALERT_MS = 2000;

// Reflejan los valores reales de detector.py (STREAMS_DISPONIBLES /
// MARCAS_DISPONIBLES): solo se usan si el backend no responde a tiempo,
// para que la interfaz se vea igual de poblada que con el backend
// arriba, en vez de mostrar listas vacias.
const FALLBACK_STREAMS = ["Nevada-1", "Nevada-2", "Nevada-3", "test-recording", "Nevada-4"];
const FALLBACK_MARCAS = [
  "tesla", "ram", "jeep", "subaru", "toyota", "chevrolet",
  "ford", "gmc", "nissan", "lexus", "mercedes", "honda", "kia",
];
const FALLBACK_OPTIONS: DetectionOptions = {
  streams: FALLBACK_STREAMS,
  // Sin URL real (el backend esta caido, no hay stream que reproducir de
  // verdad): solo hacen falta los nombres para que el carrusel y el
  // selector de marcas se vean completos. "test-recording" es la
  // excepcion - es un archivo estatico servido por el propio frontend
  // (frontend/public/test-recording-v5.mp4), asi que sigue funcionando
  // aunque el backend este caido.
  stream_urls: {
    ...Object.fromEntries(FALLBACK_STREAMS.map((s) => [s, ""])),
    "test-recording": "/test-recording-v5.mp4",
  },
  marcas: FALLBACK_MARCAS,
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
  marcas: string[];
  capture_interval: number;
}

export type DetectionStatus =
  | "idle"
  | "starting"
  | "running"
  | "stopped"
  | "error";

// Distinto de DetectionStatus (que es el ciclo de vida de UN job de
// deteccion): esto es si el backend responde en absoluto. "checking"
// dura como mucho BACKEND_CHECK_TIMEOUT_MS desde que monta la pagina.
export type BackendStatus = "checking" | "online" | "offline";

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
  // Arrancan ya con los datos de muestra (no un estado vacio a la espera
  // de un timeout): si el backend responde, se sobrescriben con los
  // reales; si no, la interfaz nunca se ve vacia/rota mientras tanto.
  const [options, setOptions] = useState<DetectionOptions>(FALLBACK_OPTIONS);
  const [jobId, setJobId] = useState<string | null>(null);
  const [status, setStatus] = useState<DetectionStatus>("idle");
  const [backendStatus, setBackendStatus] = useState<BackendStatus>("checking");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [events, setEvents] = useState<DetectionEvent[]>([]);
  // Total acumulado por marca de TODAS las sesiones (persistido en el
  // backend), no solo de los "match" recibidos por WebSocket en esta
  // pestaña. Se carga una vez al montar; los matches de esta sesion se
  // suman encima en el componente que consume este hook.
  const [persistedBrandCounts, setPersistedBrandCounts] = useState<
    Record<string, number>
  >(FALLBACK_BRAND_COUNTS);
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
    // Unica responsabilidad de este timeout: avisar (backendStatus) de
    // que el backend no responde. Los datos de muestra ya estan puestos
    // desde el estado inicial, asi que esto no toca options/brandCounts.
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
        // El timeout de arriba se encarga de avisar; un fallo puntual
        // aqui no debe tumbar el status del job en curso.
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
    async (stream: string, marcas: string[]) => {
      setStatus("starting");
      setErrorMessage(null);
      let res: Response;
      try {
        res = await fetch(`${API_BASE}/start`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ stream, marcas }),
        });
      } catch {
        // Backend inalcanzable (caido, red cortada, etc.): sin este catch
        // el fetch rechazado dejaba el boton pegado en "Starting..." para
        // siempre, ya que quien llama a start() no espera su promesa.
        setErrorMessage("Backend is unreachable right now.");
        setStatus("error");
        return;
      }

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

  // Llamado por StreamPlayer cada vez que recorta un frame del <video>
  // (canvas): se lo manda al backend por el mismo WebSocket del job, en
  // vez de que el backend se conecte el mismo al stream. `dataUrl` es lo
  // que devuelve canvas.toDataURL() - se le quita el prefijo
  // "data:image/jpeg;base64," porque el backend solo necesita los bytes.
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