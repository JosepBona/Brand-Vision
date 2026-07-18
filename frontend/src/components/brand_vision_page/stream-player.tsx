import { useEffect, useRef, useState } from "react"
import Hls from "hls.js"
import { AlertTriangle, Loader2 } from "lucide-react"

import type { StreamPlayerProps } from "@/types/brand-vision-page"

/**
 * Reproduce un stream HLS (.m3u8) directamente en el navegador.
 *
 * OJO: el <video> pide los segmentos directamente al servidor origen
 * (Nevada DOT), asi que si ese servidor no manda headers CORS permisivos,
 * esto fallara con un error de red / manifestParsingError, NO con un
 * error visible de "CORS" explicito (hls.js lo reporta como networkError).
 * Si ves errores repetidos aqui, lo mas probable es CORS y hace falta un
 * proxy en el backend.
 *
 * Ademas de reproducir, este componente es quien captura los frames que
 * se analizan: en vez de que el backend se conecte el mismo al stream
 * (lo que causaba desincronizacion con varios streams a la vez por
 * contencion de red - ver historial de detector.py), se recorta un
 * frame de este mismo <video> cada `captureIntervalSeconds` via
 * <canvas> y se manda al backend. Es, por definicion, el mismo frame que
 * el usuario esta viendo.
 */
export function StreamPlayer({
  url,
  className,
  onFirstFrame,
  captureIntervalSeconds,
  onFrameCapture,
}: StreamPlayerProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [status, setStatus] = useState<"loading" | "playing" | "error">(
    "loading"
  )
  const [errorDetail, setErrorDetail] = useState<string>("")
  const [loadDurationMs, setLoadDurationMs] = useState<number | null>(null)

  // Ref en vez de meter onFirstFrame en las deps del efecto de abajo: el
  // padre suele pasar una arrow function nueva en cada render, y si fuera
  // dependencia el efecto reconectaria el stream entero cada vez.
  const onFirstFrameRef = useRef(onFirstFrame)
  useEffect(() => {
    onFirstFrameRef.current = onFirstFrame
  }, [onFirstFrame])

  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    setStatus("loading")
    setErrorDetail("")
    setLoadDurationMs(null)

    // t0: justo antes de pedir el manifest/adjuntar al <video>. Medimos
    // desde aqui hasta que el navegador REALMENTE pinta el primer frame
    // (no cuando hls.js dice "manifest parseado", que solo significa que
    // conoce la lista de segmentos, no que haya imagen en pantalla).
    const loadStart = performance.now()
    let measured = false

    const measureOnce = (label: string) => {
      if (measured) return
      measured = true
      const elapsed = Math.round(performance.now() - loadStart)
      setLoadDurationMs(elapsed)
      console.info(`[StreamPlayer] Tiempo de carga hasta "${label}": ${elapsed}ms (${url})`)
      onFirstFrameRef.current?.(elapsed)
    }

    // "playing" es el evento nativo del <video> que se dispara cuando de
    // verdad arranca la reproduccion (no "loadedmetadata"/"canplay", que
    // pueden dispararse antes de que haya un frame visible en pantalla).
    video.addEventListener("playing", () => measureOnce("playing"), { once: true })

    // requestVideoFrameCallback (si el navegador lo soporta) es mas preciso
    // todavia: se llama justo cuando se presenta un frame decodificado para
    // composicion, asi que es la medida mas cercana a "esto ya se ve".
    const rvfcVideo = video as HTMLVideoElement & {
      requestVideoFrameCallback?: (cb: () => void) => number
    }
    rvfcVideo.requestVideoFrameCallback?.(() => measureOnce("first frame renderizado"))

    const tryPlay = () => {
      video.play().catch(() => {
        // autoplay bloqueado por el navegador pese a estar en muted;
        // el usuario puede darle play manualmente, no es un error real
      })
    }

    // Grabacion local (p.ej. /test-recording.mp4, servida por el propio
    // frontend): no es HLS, se reproduce directo sin hls.js. En loop para
    // poder probar la deteccion de forma continua sin depender de un
    // stream en vivo real.
    const isLocalRecording = /\.mp4(\?|$)/i.test(url)
    if (isLocalRecording) {
      video.loop = true
      video.src = url
      const onLoaded = () => {
        setStatus("playing")
        tryPlay()
      }
      const onError = () => {
        setStatus("error")
        setErrorDetail("No se pudo cargar la grabacion de prueba")
      }
      video.addEventListener("loadedmetadata", onLoaded)
      video.addEventListener("error", onError)
      return () => {
        video.removeEventListener("loadedmetadata", onLoaded)
        video.removeEventListener("error", onError)
        video.loop = false
      }
    }

    // hls.js primero: es mas fiable que la deteccion nativa via
    // canPlayType, que en Edge/Windows a veces reporta soporte HLS
    // parcial (Windows Media Foundation) y falla de forma inconsistente.
    // La rama nativa queda solo para Safari real, donde Hls.isSupported()
    // es false porque el navegador ya lo resuelve el solo.
    if (Hls.isSupported()) {
      const hls = new Hls({
        manifestLoadingMaxRetry: 2,
      })

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        setStatus("playing")
        tryPlay()
      })

      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (!data.fatal) return
        setStatus("error")
        if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
          setErrorDetail(
            `Error de red (${data.details}) — probablemente CORS bloqueando el servidor origen`
          )
        } else {
          setErrorDetail(`${data.type}: ${data.details}`)
        }
      })

      hls.loadSource(url)
      hls.attachMedia(video)

      return () => hls.destroy()
    }

    if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = url
      const onLoaded = () => {
        setStatus("playing")
        tryPlay()
      }
      const onError = () => {
        setStatus("error")
        setErrorDetail("El navegador no pudo cargar el manifest HLS")
      }
      video.addEventListener("loadedmetadata", onLoaded)
      video.addEventListener("error", onError)
      return () => {
        video.removeEventListener("loadedmetadata", onLoaded)
        video.removeEventListener("error", onError)
      }
    }

    setStatus("error")
    setErrorDetail("Este navegador no soporta HLS ni MSE")
  }, [url])

  // Captura periodica: solo mientras el <video> esta realmente
  // reproduciendo (no durante "loading"/"error", donde no hay nada valido
  // que recortar). Un <canvas> del tamaño real del video (no del <video>
  // en pantalla, que puede estar escalado por CSS) evita perder
  // resolucion en el recorte.
  useEffect(() => {
    if (status !== "playing" || !onFrameCapture) return
    const video = videoRef.current
    if (!video) return

    const intervalMs = Math.max(1, captureIntervalSeconds || 10) * 1000

    const captureFrame = () => {
      if (!video.videoWidth || !video.videoHeight) return
      const canvas = canvasRef.current ?? document.createElement("canvas")
      canvasRef.current = canvas
      canvas.width = video.videoWidth
      canvas.height = video.videoHeight
      const ctx = canvas.getContext("2d")
      if (!ctx) return
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
      onFrameCapture(canvas.toDataURL("image/jpeg", 0.85))
    }

    // Primera captura casi inmediata (el video ya esta reproduciendo),
    // luego cada intervalo - no esperar al primer tick del setInterval.
    captureFrame()
    const id = window.setInterval(captureFrame, intervalMs)
    return () => window.clearInterval(id)
  }, [status, captureIntervalSeconds, onFrameCapture])

  return (
    <div className={className} style={{ position: "relative" }}>
      <video
        ref={videoRef}
        autoPlay
        muted
        playsInline
        controls
        className="h-full w-full bg-black object-contain"
      />
      {status !== "playing" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/70 text-white">
          {status === "loading" ? (
            <>
              <Loader2 className="h-6 w-6 animate-spin" />
              <p className="text-sm">Conectando al stream…</p>
            </>
          ) : (
            <>
              <AlertTriangle className="h-6 w-6 text-destructive" />
              <p className="max-w-xs px-4 text-center text-sm text-destructive">
                {errorDetail || "No se pudo reproducir el stream"}
              </p>
            </>
          )}
        </div>
      )}
      {loadDurationMs !== null && (
        <div className="absolute bottom-2 left-2 rounded bg-black/60 px-2 py-1 text-[10px] text-white">
          Load: {loadDurationMs}ms
        </div>
      )}
    </div>
  )
}

export default StreamPlayer
