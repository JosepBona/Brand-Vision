import { useEffect, useRef, useState } from "react"
import Hls from "hls.js"
import { AlertTriangle, Loader2 } from "lucide-react"

import type { StreamPlayerProps } from "@/projects/brand-vision/types"

/**
 * Plays an HLS (.m3u8) stream directly in the browser.
 *
 * HEADS UP: the <video> requests segments directly from the origin server
 * (Nevada DOT), so if that server doesn't send permissive CORS headers,
 * this will fail with a network error / manifestParsingError, NOT with a
 * visible explicit "CORS" error (hls.js reports it as networkError).
 * If you see repeated errors here, it's most likely CORS and a proxy is
 * needed in the backend.
 *
 * Besides playing, this component is also what captures the frames that
 * get analyzed: instead of the backend connecting to the stream itself
 * (which caused desync across multiple simultaneous streams due to
 * network contention - see detector.py's history), a frame is cropped
 * from this same <video> every `captureIntervalSeconds` via <canvas> and
 * sent to the backend. It is, by definition, the same frame the user
 * is watching.
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

  // Ref instead of putting onFirstFrame in the effect's deps below: the
  // parent usually passes a new arrow function on every render, and if it
  // were a dependency the effect would reconnect the whole stream every time.
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

    // t0: right before requesting the manifest/attaching to the <video>.
    // We measure from here until the browser REALLY paints the first frame
    // (not when hls.js says "manifest parsed", which only means it knows
    // the segment list, not that there's an image on screen).
    const loadStart = performance.now()
    let measured = false

    const measureOnce = (label: string) => {
      if (measured) return
      measured = true
      const elapsed = Math.round(performance.now() - loadStart)
      setLoadDurationMs(elapsed)
      console.info(`[StreamPlayer] Load time until "${label}": ${elapsed}ms (${url})`)
      onFirstFrameRef.current?.(elapsed)
    }

    // "playing" is the native <video> event that fires when playback
    // really starts (not "loadedmetadata"/"canplay", which can fire
    // before there's a visible frame on screen).
    video.addEventListener("playing", () => measureOnce("playing"), { once: true })

    // requestVideoFrameCallback (if the browser supports it) is even
    // more precise: it's called right when a decoded frame is presented
    // for composition, so it's the measurement closest to "this is
    // actually visible".
    const rvfcVideo = video as HTMLVideoElement & {
      requestVideoFrameCallback?: (cb: () => void) => number
    }
    rvfcVideo.requestVideoFrameCallback?.(() => measureOnce("first frame rendered"))

    const tryPlay = () => {
      video.play().catch(() => {
        // autoplay blocked by the browser despite being muted; the user
        // can hit play manually, this isn't a real error
      })
    }

    // Local recording (e.g. /test-recording.mp4, served by the frontend
    // itself): not HLS, plays directly without hls.js. Looped so
    // detection can be tested continuously without depending on a real
    // live stream.
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
        setErrorDetail("Could not load the test recording")
      }
      video.addEventListener("loadedmetadata", onLoaded)
      video.addEventListener("error", onError)
      return () => {
        video.removeEventListener("loadedmetadata", onLoaded)
        video.removeEventListener("error", onError)
        video.loop = false
      }
    }

    // hls.js first: it's more reliable than native detection via
    // canPlayType, which on Edge/Windows sometimes reports partial HLS
    // support (Windows Media Foundation) and fails inconsistently. The
    // native branch is only for real Safari, where Hls.isSupported() is
    // false because the browser already handles it natively.
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
            `Network error (${data.details}) — likely CORS blocking the origin server`
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
        setErrorDetail("The browser couldn't load the HLS manifest")
      }
      video.addEventListener("loadedmetadata", onLoaded)
      video.addEventListener("error", onError)
      return () => {
        video.removeEventListener("loadedmetadata", onLoaded)
        video.removeEventListener("error", onError)
      }
    }

    setStatus("error")
    setErrorDetail("This browser doesn't support HLS or MSE")
  }, [url])

  // Periodic capture: only while the <video> is actually playing (not
  // during "loading"/"error", where there's nothing valid to crop). A
  // <canvas> sized to the video's real resolution (not the on-screen
  // <video>, which can be scaled by CSS) avoids losing resolution in
  // the crop.
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

    // First capture almost immediately (the video is already playing),
    // then every interval - don't wait for setInterval's first tick.
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
              <p className="text-sm">Connecting to stream…</p>
            </>
          ) : (
            <>
              <AlertTriangle className="h-6 w-6 text-destructive" />
              <p className="max-w-xs px-4 text-center text-sm text-destructive">
                {errorDetail || "Could not play the stream"}
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
