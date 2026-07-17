import { useEffect, useMemo, useRef, useState } from "react"

import { useVehicleDetection } from "@/hooks/useVehicleDetection"
import { brandColor } from "@/components/brand_vision_page/brand-color"
import HeroBrandVision from "@/components/brand_vision_page/hero_brand_vision"
import StreamCarousel from "@/components/brand_vision_page/stream-carousel"
import BrandFilter from "@/components/brand_vision_page/brand-filter"
import DetectionActionBar from "@/components/brand_vision_page/detection-action-bar"
import HighConfidenceChart from "@/components/brand_vision_page/high-confidence-chart"
import TopBrandsRadarChart from "@/components/brand_vision_page/top-brands-radar-chart"
import LastCapturePanel from "@/components/brand_vision_page/last-capture-panel"
import DetectionHistoryTable from "@/components/brand_vision_page/detection-history-table"

export function VehicleBrandDetector() {
  const {
    options,
    start,
    stop,
    status,
    events,
    matches,
    mediaUrl,
    detectedMediaUrl,
    persistedBrandCounts,
  } = useVehicleDetection()

  // El backend solo soporta UN stream por job (/start recibe "stream", no
  // una lista), asi que la seleccion de stream es unica, no multiple.
  const [selectedStream, setSelectedStream] = useState<string>("")
  const [selectedBrands, setSelectedBrands] = useState<string[]>([])

  const isRunning = status === "running" || status === "starting"

  // Marca si el <video> ya empezo a mostrar imagen en ESTA ejecucion: la
  // cuenta atras de "next capture" no debe empezar a bajar hasta que esto
  // sea true (ver el efecto de mas abajo), asi que arranca en false y se
  // resetea cada vez que se detiene la deteccion.
  const [videoStarted, setVideoStarted] = useState(false)
  const handleStreamFirstFrame = () => {
    setVideoStarted(true)
  }

  // Cuenta atras hasta la proxima captura del backend: se reinicia cada vez
  // que llega un evento con un numero de frame nuevo (el backend emite uno
  // por cada captura, cada DEFAULT_INTERVAL segundos), no con un timer ciego
  // desacoplado de lo que realmente esta pasando en el backend.
  const [secondsToNextCapture, setSecondsToNextCapture] = useState(
    options.capture_interval
  )
  const lastFrameRef = useRef<number | null>(null)

  useEffect(() => {
    const latest = events[0]
    if (!latest) return
    const latestFrame = latest.frame
    const isNewFrame =
      typeof latestFrame === "number" && latestFrame !== lastFrameRef.current
    // capture_failed no trae "frame" (la captura fallo, no hubo frame que
    // contar), pero el backend igual duerme DEFAULT_INTERVAL antes de
    // reintentar - sin este caso el countdown se queda pegado en 0 durante
    // una racha de fallos de captura.
    if (isNewFrame) {
      lastFrameRef.current = latestFrame
      setSecondsToNextCapture(options.capture_interval)
    } else if (latest.type === "capture_failed") {
      setSecondsToNextCapture(options.capture_interval)
    }
  }, [events, options.capture_interval])

  useEffect(() => {
    if (!isRunning) {
      lastFrameRef.current = null
      setVideoStarted(false)
      setSecondsToNextCapture(options.capture_interval)
      return
    }
    // Corriendo pero el <video> todavia no ha mostrado imagen: la cuenta
    // atras se queda quieta en el valor completo, no empieza a bajar hasta
    // que handleStreamFirstFrame confirme que ya hay imagen en pantalla.
    if (!videoStarted) {
      setSecondsToNextCapture(options.capture_interval)
      return
    }
    const id = setInterval(() => {
      setSecondsToNextCapture((s) => (s > 0 ? s - 1 : 0))
    }, 1000)
    return () => clearInterval(id)
  }, [isRunning, videoStarted, options.capture_interval])


  const brandStats = useMemo(() => {
    const counts: Record<string, number> = { ...persistedBrandCounts }
    for (const match of matches) {
      if (!match.marca) continue
      counts[match.marca] = (counts[match.marca] ?? 0) + 1
    }
    const total = Object.values(counts).reduce((sum, c) => sum + c, 0)
    const top = Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .map(([marca, count], idx) => ({
        marca,
        count,
        pct: total ? Math.round((count / total) * 100) : 0,
        color: brandColor(idx),
      }))
    return { total, top }
  }, [matches, persistedBrandCounts])

  const handleToggle = () => {
    if (isRunning) {
      stop()
    } else if (selectedStream && selectedBrands.length > 0) {
      start(selectedStream, selectedBrands)
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-0.5 pb-12 sm:px-1 xl:max-w-7xl 2xl:max-w-[100rem]">
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_15.625rem]">
        {/* Columna izquierda: hero + streams + marcas + accion */}
        <div className="flex min-w-0 flex-col gap-5">
          <HeroBrandVision brandStats={brandStats} />

          <StreamCarousel
            streams={options.streams}
            streamUrls={options.stream_urls}
            isRunning={isRunning}
            selectedStream={selectedStream}
            onSelectStream={(id) =>
              setSelectedStream((prev) => (prev === id ? "" : id))
            }
            secondsToNextCapture={secondsToNextCapture}
            onFirstFrame={handleStreamFirstFrame}
          />

          <BrandFilter
            brands={options.marcas}
            selected={selectedBrands}
            onChange={setSelectedBrands}
            disabled={isRunning}
          />

          <DetectionActionBar
            status={status}
            isRunning={isRunning}
            canStart={!!selectedStream && selectedBrands.length > 0}
            onToggle={handleToggle}
            streamCount={selectedStream ? 1 : 0}
            brandCount={selectedBrands.length}
          />
        </div>

        {/* Columna derecha: ocupa todo el alto del dashboard. Contiene dos mini-graficas (recharts)*/}
        <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-3">
          <HighConfidenceChart matches={matches} topBrands={brandStats.top} />
          <TopBrandsRadarChart topBrands={brandStats.top} />

          {/* Ultima captura del backend, debajo de la barra lateral,
              ocupando el resto del alto disponible. */}
          <LastCapturePanel
            events={events}
            mediaUrl={mediaUrl}
            detectedMediaUrl={detectedMediaUrl}
          />
        </div>
      </div>

      <DetectionHistoryTable matches={matches} mediaUrl={mediaUrl} />
    </div>
  )
}

export default VehicleBrandDetector
