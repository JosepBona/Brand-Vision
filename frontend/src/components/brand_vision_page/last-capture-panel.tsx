import { useMemo, useState } from "react"
import { Loader2 } from "lucide-react"

import { cn } from "@/lib/utils"
import type { DetectionEvent } from "@/hooks/useVehicleDetection"
import type {
  CaptureImageProps,
  LastCapturePanelProps,
} from "@/types/brand-vision-page"

// key={frame} en el sitio de uso fuerza un remount completo por cada
// captura nueva, asi loaded siempre arranca en false de forma limpia (sin
// depender de comparar el frame anterior via ref/efecto, que podria pisarse
// con la propia carga de la imagen si esta es muy rapida).
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
  // Captura mas reciente enviada por el backend, tenga o no vehiculos: a
  // diferencia de lastMatch (solo eventos "match"), esto mira cualquier
  // evento con frame_data (incluye los "status" de cada ciclo de captura).
  const latestCapture = events.find((e) => e.frame_data)

  // TODOS los vehiculos recortados (match + detected) del ultimo ciclo de
  // captura: los eventos van del mas nuevo al mas viejo, y cada ciclo
  // arranca con un "status"/"capture_failed", asi que lo que aparece antes
  // del primer status/capture_failed son los recortes de la ultima
  // captura, no del historial completo de la sesion.
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
            alt="Ultima captura del stream"
          />

          {/* Recortes "detected" (no llegaron a match) de ESTE mismo
              ciclo de captura, pegado justo debajo de la imagen. */}
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
                      alt={d.marca ?? "Detected vehicle"}
                      className="h-20 w-full object-cover"
                    />
                    <div className="absolute inset-x-0 bottom-0 bg-black/60 px-1.5 py-0.5 text-center text-[10px] text-white">
                      <span className="capitalize">{d.marca ?? "—"}</span>
                      {d.confianza != null && (
                        <span> · {(d.confianza * 100).toFixed(0)}%</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground">
          No detections to show yet.
        </div>
      )}
    </div>
  )
}

export default LastCapturePanel
