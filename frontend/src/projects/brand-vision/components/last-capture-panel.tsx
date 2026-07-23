import { useMemo, useState } from "react"
import { Loader2 } from "lucide-react"

import { cn } from "@/lib/utils"
import type { DetectionEvent } from "@/projects/brand-vision/hooks/useVehicleDetection"
import type {
  CaptureImageProps,
  LastCapturePanelProps,
} from "@/projects/brand-vision/types"

// key={frame} at the call site forces a full remount on every new capture,
// so loaded always starts cleanly at false (instead of depending on
// comparing the previous frame via ref/effect, which could race with the
// image load itself if it's very fast).
function CaptureImage({ src, alt }: CaptureImageProps) {
  const [loaded, setLoaded] = useState(false)
  return (
    <div className="relative">
      <img
        src={src}
        alt={alt}
        onLoad={() => setLoaded(true)}
        className={cn(
          "w-full object-contain transition-opacity duration-300",
          loaded ? "opacity-100" : "opacity-0"
        )}
      />
      {!loaded && (
        <div className="absolute inset-0 flex items-center justify-center bg-background/70">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      )}
    </div>
  )
}

export function LastCapturePanel({ events }: LastCapturePanelProps) {
  // Most recent capture sent by the backend, whether or not it has
  // vehicles: unlike lastMatch (only "match" events), this looks at any
  // event with frame_data (includes the "status" of each capture cycle).
  const latestCapture = events.find((e) => e.frame_data)

  // ALL cropped vehicles (match + detected) from the last capture cycle:
  // events go from newest to oldest, and each cycle starts with a
  // "status"/"capture_failed", so whatever appears before the first
  // status/capture_failed are the crops from the latest capture, not
  // the full session history.
  const latestCycleDetectedCrops = useMemo(() => {
    const result: DetectionEvent[] = []
    for (const e of events) {
      if (e.type === "status" || e.type === "capture_failed") break
      if (e.type === "match" || e.type === "detected") result.push(e)
    }
    return result
  }, [events])

  return (
    <div className="flex flex-1 flex-col gap-3">
      {latestCapture?.frame_data ? (
        <div className="overflow-hidden rounded-lg border bg-background">
          <p className="border-b px-3 py-1.5 text-xs font-medium text-muted-foreground">
            Last capture
          </p>
          <CaptureImage
            key={latestCapture.frame}
            src={`data:image/jpeg;base64,${latestCapture.frame_data}`}
            alt="Latest stream capture"
          />

          {/* "detected" crops (didn't reach match) from this same capture
              cycle, placed right below the image. */}
          <div className="border-t px-3 py-2">
            <p className="mb-2 text-xs font-medium text-muted-foreground">
              Detected crops
            </p>
            {latestCycleDetectedCrops.length === 0 ? (
              <p className="text-center text-xs text-muted-foreground">
                No detected crops in this capture.
              </p>
            ) : (
              <div className="grid grid-cols-3 gap-2 pb-1">
                {latestCycleDetectedCrops.map((d, idx) => (
                  <div
                    key={`${d.timestamp}-${idx}`}
                    className="relative overflow-hidden rounded-lg border bg-background"
                  >
                    <img
                      src={
                        d.type === "match"
                          ? d.crop_data
                            ? `data:image/png;base64,${d.crop_data}`
                            : undefined
                          : d.image_data
                            ? `data:image/png;base64,${d.image_data}`
                            : undefined
                      }
                      alt={d.brand ?? "Detected vehicle"}
                      className="h-20 w-full object-cover 3xl:h-32 4xl:h-40"
                    />
                    <div className="absolute inset-x-0 bottom-0 bg-black/60 px-1.5 py-0.5 text-center text-[10px] text-white">
                      <span className="capitalize">{d.brand ?? "—"}</span>
                      {d.confidence != null && (
                        <span> · {(d.confidence * 100).toFixed(0)}%</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground 4xl:min-h-[32rem] 4xl:text-base">
          No detections to show yet.
        </div>
      )}
    </div>
  )
}

export default LastCapturePanel
