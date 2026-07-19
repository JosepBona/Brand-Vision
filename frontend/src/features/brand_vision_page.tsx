import { useEffect, useMemo, useRef, useState } from "react"
import { WifiOff } from "lucide-react"

import { useVehicleDetection } from "@/hooks/useVehicleDetection"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
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
    backendStatus,
    errorMessage,
    events,
    matches,
    persistedBrandCounts,
    sendFrame,
  } = useVehicleDetection()

  // The backend only supports ONE stream per job (/start receives
  // "stream", not a list), so stream selection is single, not multiple.
  const [selectedStream, setSelectedStream] = useState<string>("")
  const [selectedBrands, setSelectedBrands] = useState<string[]>([])

  const isRunning = status === "running" || status === "starting"
  // Different from isRunning: the video player UI shouldn't mount until
  // the backend confirms /start went well (e.g. no conflict with a stream
  // already in use - see 409 in api.py). If it showed already in
  // "starting", a quick failure (409, network error) would make the
  // carousel switch to video and back to the carousel almost instantly -
  // the flicker this was meant to avoid.
  const showPlayer = status === "running"

  // Marks whether the <video> has started showing an image in THIS run:
  // the "next capture" countdown shouldn't start counting down until this
  // is true (see the effect below), so it starts at false and resets
  // every time detection stops.
  const [videoStarted, setVideoStarted] = useState(false)
  const handleStreamFirstFrame = () => {
    setVideoStarted(true)
  }

  // Countdown to the backend's next capture: resets every time an event
  // arrives with a new frame number (the backend emits one per capture,
  // every DEFAULT_INTERVAL seconds), not with a blind timer decoupled
  // from what's actually happening in the backend.
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
    // capture_failed doesn't carry a "frame" (the capture failed, there
    // was no frame to count), but the backend still sleeps DEFAULT_INTERVAL
    // before retrying - without this case the countdown gets stuck at 0
    // during a streak of capture failures.
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
    // Running but the <video> hasn't shown an image yet: the countdown
    // stays fixed at the full value, it doesn't start counting down until
    // handleStreamFirstFrame confirms there's already an image on screen.
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
      if (!match.brand) continue
      counts[match.brand] = (counts[match.brand] ?? 0) + 1
    }
    const total = Object.values(counts).reduce((sum, c) => sum + c, 0)
    const top = Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .map(([brand, count], idx) => ({
        brand,
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
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-[1.5rem] pb-12 4xl:px-[3.5rem] xl:max-w-7xl 2xl:max-w-[100rem] 3xl:max-w-[130rem] 4xl:max-w-[160rem]">
      {backendStatus === "offline" && (
        <Alert className="border-sky-500/40 bg-sky-500/15 text-sky-100">
          <WifiOff className="h-4 w-4" />
          <AlertTitle>Backend connection is down</AlertTitle>
          <AlertDescription className="text-sky-100/80">
            You can still browse and interact with the interface, but
            vehicle detection isn't available right now.
          </AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_15.625rem] 3xl:grid-cols-[1fr_17.33rem] 4xl:grid-cols-[1fr_21.33rem]">
        {/* Left column: hero + streams + brands + action */}
        <div className="flex min-w-0 flex-col gap-5">
          <HeroBrandVision brandStats={brandStats} />

          <StreamCarousel
            streams={options.streams}
            streamUrls={options.stream_urls}
            isRunning={showPlayer}
            selectedStream={selectedStream}
            onSelectStream={(id) =>
              setSelectedStream((prev) => (prev === id ? "" : id))
            }
            secondsToNextCapture={secondsToNextCapture}
            onFirstFrame={handleStreamFirstFrame}
            captureIntervalSeconds={options.capture_interval}
            onFrameCapture={sendFrame}
          />

          <BrandFilter
            brands={options.brands}
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

          {status === "error" && errorMessage && (
            <p className="text-sm text-destructive">{errorMessage}</p>
          )}
        </div>

        {/* Right column: spans the full height of the dashboard. Contains two mini-charts (recharts)*/}
        <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-3 3xl:gap-5 3xl:p-5">
          <HighConfidenceChart matches={matches} topBrands={brandStats.top} />
          <TopBrandsRadarChart topBrands={brandStats.top} />

          {/* Latest backend capture, below the sidebar, taking up the
              rest of the available height. */}
          <LastCapturePanel events={events} />
        </div>
      </div>

      <DetectionHistoryTable matches={matches} />
    </div>
  )
}

export default VehicleBrandDetector
