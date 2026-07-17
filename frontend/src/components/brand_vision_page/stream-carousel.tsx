import { useEffect, useRef, useState } from "react"
import { motion, AnimatePresence } from "motion/react"
import { Car, Cctv, ChevronLeft, ChevronRight } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import StreamPlayer from "@/components/brand_vision_page/stream-player"
import type { StreamCarouselProps } from "@/types/brand-vision-page"
import stream1 from "@/assets/stream1.jpg"
import stream2 from "@/assets/stream2.jpg"
import stream3 from "@/assets/stream3.jpg"
import stream4 from "@/assets/stream4.jpg"

// Miniaturas locales, asignadas en orden a los streams que devuelva el
// backend (/options). Si hay mas streams que miniaturas, los sobrantes
// simplemente no muestran imagen.
const thumbnails = [stream1, stream2, stream3, stream4]

// TODO: quitar una vez validado el carrusel. Streams dummy solo para
// visualizar el scroll/las flechas con mas de 3 elementos; no existen
// en el backend asi que no se pueden seleccionar para iniciar deteccion.
// Nevada-4 ya es un stream real (STREAMS_DISPONIBLES en detector.py), asi
// que sale de options.streams y no necesita entrada demo aqui.
const DEMO_EXTRA_STREAMS = ["Nevada-5 (demo)", "Nevada-6 (demo)"]

const STREAM_SCROLL_AMOUNT = 240

export function StreamCarousel({
  streams,
  streamUrls,
  isRunning,
  selectedStream,
  onSelectStream,
  secondsToNextCapture,
  onFirstFrame,
}: StreamCarouselProps) {
  const streamScrollerRef = useRef<HTMLDivElement>(null)
  const [streamEdges, setStreamEdges] = useState({
    atStart: true,
    atEnd: false,
  })

  // Streams "demo" solo se muestran como miniaturas para probar el
  // carrusel; se excluyen de /options asi que nunca llegan a start().
  const displayStreams = [...streams, ...DEMO_EXTRA_STREAMS]

  const updateStreamEdges = () => {
    const el = streamScrollerRef.current
    if (!el) return
    setStreamEdges({
      atStart: el.scrollLeft <= 1,
      atEnd: el.scrollLeft + el.clientWidth >= el.scrollWidth - 1,
    })
  }

  // Fija el estado inicial de las flechas cuando cambia la lista de
  // streams (p.ej. al cargar /options), por si de entrada ya no cabe todo.
  useEffect(() => {
    updateStreamEdges()
  }, [displayStreams.length])

  const selectStream = (id: string) => {
    if (!(id in streamUrls)) return // entradas demo: no seleccionables
    onSelectStream(id)
  }

  const scrollStreams = (direction: 1 | -1) => {
    streamScrollerRef.current?.scrollBy({
      left: direction * STREAM_SCROLL_AMOUNT,
      behavior: "smooth",
    })
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium">Available streams</h2>
        {!isRunning && displayStreams.length > 1 && (
          <div className="flex items-center gap-1.5">
            <Button
              variant="outline"
              size="icon-xs"
              onClick={() => scrollStreams(-1)}
              disabled={streamEdges.atStart}
              className="rounded-full border-2 border-white dark:border-white"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="icon-xs"
              onClick={() => scrollStreams(1)}
              disabled={streamEdges.atEnd}
              className="rounded-full border-2 border-white dark:border-white"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>

      {streams.length === 0 && (
        <p className="text-sm text-muted-foreground">
          Loading streams from backend…
        </p>
      )}

      {isRunning ? (
        <AnimatePresence>
          {streams
            .filter((streamId) => streamId === selectedStream)
            .map((streamId) => (
              <motion.div
                key={streamId}
                layoutId={`stream-${streamId}`}
                layout
                transition={{
                  type: "spring",
                  stiffness: 300,
                  damping: 30,
                }}
                className="w-full overflow-hidden rounded-2xl border-[3px] border-border bg-card text-left shadow-[0_10px_30px_-8px_rgba(0,0,0,0.6)]"
              >
                <div className="relative m-1.5 h-80 overflow-hidden rounded-lg bg-muted">
                  <StreamPlayer
                    url={streamUrls[streamId]}
                    className="h-full w-full"
                    onFirstFrame={onFirstFrame}
                  />
                  <div className="absolute top-2 right-2 z-10 flex items-center gap-1.5 rounded-full bg-black/60 px-2.5 py-1 text-xs font-medium text-white backdrop-blur-sm">
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
                    Next capture in {secondsToNextCapture}s
                  </div>
                </div>
              </motion.div>
            ))}
        </AnimatePresence>
      ) : (
        <div className="relative">
          {/* Fundidos en los bordes: indican que hay mas streams fuera
              de vista en vez de cortar la ultima card en seco. Solo se
              muestran mientras haya contenido oculto en ese lado
              (streamEdges), y no bloquean el scroll (pointer-events-none). */}
          {!streamEdges.atStart && (
            <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-10 bg-gradient-to-r from-background to-transparent" />
          )}
          {!streamEdges.atEnd && (
            <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-10 bg-gradient-to-l from-background to-transparent" />
          )}
          <div
            ref={streamScrollerRef}
            onScroll={updateStreamEdges}
            className="flex min-w-0 [scrollbar-width:none] gap-3 overflow-x-auto scroll-smooth px-1 pt-1 pb-3 [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
          >
            {displayStreams.map((streamId, idx) => {
              const active = selectedStream === streamId
              const thumbnail = thumbnails[idx]
              const isDemo = !(streamId in streamUrls)

              return (
                <motion.button
                  key={streamId}
                  layoutId={`stream-${streamId}`}
                  layout
                  type="button"
                  onClick={() => selectStream(streamId)}
                  transition={{
                    type: "spring",
                    stiffness: 300,
                    damping: 30,
                  }}
                  className={cn(
                    "group relative w-56 shrink-0 overflow-hidden rounded-2xl border-[3px] border-border bg-card text-left shadow-[0_10px_28px_-8px_rgba(0,0,0,0.6)] transition-all duration-300 hover:scale-[1.03] hover:shadow-[0_16px_36px_-8px_rgba(0,0,0,0.7)]",
                    isDemo && "cursor-default",
                    // Seleccionado = misma pinta que el hover, pero fija:
                    // escala y sombra del hover se quedan puestas en vez
                    // de depender de que el raton siga encima.
                    active &&
                      "scale-[1.03] shadow-[0_16px_36px_-8px_rgba(0,0,0,0.7)]"
                  )}
                >
                  {/* Linea que recorre el borde (rosa/azul), visible en
                      hover (group-hover, via CSS) o si el stream esta
                      seleccionado (border-beam-active). Es el unico
                      indicador de seleccion: ya no se tine de azul el
                      fondo/texto, la animacion del beam (heredada del
                      hover) es la que queda fija.
                      Nota: no se usa cn() aqui porque tailwind-merge
                      interpreta "border-beam" y "border-beam-active"
                      como clases de borde en conflicto (ambas empiezan
                      por "border-") y descarta la primera, dejando el
                      span sin el gradiente/animacion base. */}
                  <span
                    className={`border-beam${active ? " border-beam-active" : ""}`}
                  />
                  <div className="flex items-center gap-2 px-2.5 py-2">
                    <Cctv className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <span className="text-xs font-medium">{streamId}</span>
                  </div>
                  <div className="relative m-1.5 mt-0 flex h-28 items-center justify-center overflow-hidden rounded-lg bg-muted">
                    {thumbnail ? (
                      <img
                        src={thumbnail}
                        alt={streamId}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <Car className="h-8 w-8 text-muted-foreground" />
                    )}
                    <Badge
                      variant="destructive"
                      className="absolute top-1.5 left-1.5 text-[11px]"
                    >
                      Live
                    </Badge>
                  </div>
                </motion.button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

export default StreamCarousel
