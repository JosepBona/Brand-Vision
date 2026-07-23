import { useEffect, useRef, useState } from "react"
import { Car, Cctv, ChevronLeft, ChevronRight } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import StreamPlayer from "@/projects/brand-vision/components/stream-player"
import type { StreamCarouselProps } from "@/projects/brand-vision/types"
import stream1 from "@/assets/stream1.jpg"
import stream2 from "@/assets/stream2.jpg"
import stream3 from "@/assets/stream3.jpg"
import stream4 from "@/assets/stream4.jpg"
import testRecordingThumbnail from "@/assets/test-recording.jpg"

// Local thumbnails, assigned by stream name (not by position: the order
// in options.streams can change). If a stream has no entry here, it
// simply shows no image (see fallback below).
const thumbnailsByStream: Record<string, string> = {
  "Nevada-1": stream1,
  "Nevada-2": stream2,
  "Nevada-3": stream3,
  "Nevada-4": stream4,
  "test-recording": testRecordingThumbnail,
}

// TODO: remove once the carousel is validated. Dummy stream just to
// visualize scroll/arrows with more than 3 items; it doesn't exist in
// the backend so it can't be selected to start detection. Nevada-1..4
// and test-recording are already real streams (STREAMS_DISPONIBLES in
// detector.py), so they come from options.streams and don't need a
// demo entry here.
const DEMO_EXTRA_STREAMS = ["Nevada-6 (demo)"]

const STREAM_SCROLL_AMOUNT = 240

export function StreamCarousel({
  streams,
  streamUrls,
  isRunning,
  selectedStream,
  onSelectStream,
  secondsToNextCapture,
  onFirstFrame,
  captureIntervalSeconds,
  onFrameCapture,
}: StreamCarouselProps) {
  const streamScrollerRef = useRef<HTMLDivElement>(null)
  const [streamEdges, setStreamEdges] = useState({
    atStart: true,
    atEnd: false,
  })

  // "demo" streams only show as thumbnails to test the carousel; they're
  // excluded from /options so they never reach start().
  const displayStreams = [...streams, ...DEMO_EXTRA_STREAMS]

  const updateStreamEdges = () => {
    const el = streamScrollerRef.current
    if (!el) return
    setStreamEdges({
      atStart: el.scrollLeft <= 1,
      atEnd: el.scrollLeft + el.clientWidth >= el.scrollWidth - 1,
    })
  }

  // Sets the initial arrow state when the stream list changes (e.g. when
  // /options loads), in case everything doesn't fit from the start.
  useEffect(() => {
    updateStreamEdges()
  }, [displayStreams.length])

  const selectStream = (id: string) => {
    if (!(id in streamUrls)) return // demo entries: not selectable
    onSelectStream(id)
  }

  const scrollStreams = (direction: 1 | -1) => {
    streamScrollerRef.current?.scrollBy({
      left: direction * STREAM_SCROLL_AMOUNT,
      behavior: "smooth",
    })
  }

  return (
    <div className="flex flex-col gap-1 4xl:mt-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium">Available streams</h2>
        {!isRunning && displayStreams.length > 1 && (
          <div className="flex items-center gap-1.5">
            <Button
              variant="outline"
              size="icon-xs"
              onClick={() => scrollStreams(-1)}
              disabled={streamEdges.atStart}
              aria-label="Scroll streams left"
              className="rounded-full border-2 border-white dark:border-white"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="icon-xs"
              onClick={() => scrollStreams(1)}
              disabled={streamEdges.atEnd}
              aria-label="Scroll streams right"
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
        <>
          {streams
            .filter((streamId) => streamId === selectedStream)
            .map((streamId) => (
              <div
                key={streamId}
                className="w-full overflow-hidden rounded-2xl border-[3px] border-border bg-card text-left shadow-[0_10px_30px_-8px_rgba(0,0,0,0.6)]"
              >
                <div className="relative m-1.5 h-80 overflow-hidden rounded-lg bg-muted 3xl:h-[28rem] 4xl:h-[42rem]">
                  <StreamPlayer
                    url={streamUrls[streamId]}
                    className="h-full w-full"
                    onFirstFrame={onFirstFrame}
                    captureIntervalSeconds={captureIntervalSeconds}
                    onFrameCapture={onFrameCapture}
                  />
                  <div className="absolute top-2 right-2 z-10 flex items-center gap-1.5 rounded-full bg-black/60 px-2.5 py-1 text-xs font-medium text-white backdrop-blur-sm">
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
                    Next capture in {secondsToNextCapture}s
                  </div>
                </div>
              </div>
            ))}
        </>
      ) : (
        <div className="relative">
          {/* Edge fades: indicate there are more streams out of view instead
              of abruptly cutting off the last card. Only shown while there
              is hidden content on that side (streamEdges), and don't block
              scrolling (pointer-events-none). */}
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
            {displayStreams.map((streamId) => {
              const active = selectedStream === streamId
              const thumbnail = thumbnailsByStream[streamId]
              const isDemo = !(streamId in streamUrls)

              return (
                <button
                  key={streamId}
                  type="button"
                  onClick={() => selectStream(streamId)}
                  className={cn(
                    "group relative w-56 shrink-0 overflow-hidden rounded-2xl border-[3px] border-border bg-card text-left shadow-[0_10px_28px_-8px_rgba(0,0,0,0.6)] transition-all duration-300 hover:scale-[1.03] hover:shadow-[0_16px_36px_-8px_rgba(0,0,0,0.7)] 3xl:w-72 4xl:w-96",
                    isDemo && "cursor-default",
                    // Selected = same look as hover, but fixed: hover's
                    // scale and shadow stay applied instead of depending
                    // on the mouse staying on top.
                    active &&
                      "scale-[1.03] shadow-[0_16px_36px_-8px_rgba(0,0,0,0.7)]"
                  )}
                >
                  {/* Line that travels around the border (pink/blue),
                      visible on hover (group-hover, via CSS) or if the
                      stream is selected (border-beam-active). It's the
                      only selection indicator: the background/text no
                      longer tints blue, the beam's animation (inherited
                      from hover) is what stays fixed.
                      Note: cn() isn't used here because tailwind-merge
                      interprets "border-beam" and "border-beam-active"
                      as conflicting border classes (both start with
                      "border-") and drops the first one, leaving the
                      span without the base gradient/animation. */}
                  <span
                    className={`border-beam${active ? " border-beam-active" : ""}`}
                  />
                  <div className="flex items-center gap-2 px-2.5 py-2 3xl:px-3.5 3xl:py-3 4xl:px-4 4xl:py-3.5">
                    <Cctv className="h-3.5 w-3.5 shrink-0 text-muted-foreground 3xl:h-4.5 3xl:w-4.5 4xl:h-5 4xl:w-5" />
                    <span className="text-xs font-medium 3xl:text-sm 4xl:text-lg">{streamId}</span>
                  </div>
                  <div className="relative m-1.5 mt-0 flex h-28 items-center justify-center overflow-hidden rounded-lg bg-muted 3xl:h-36 4xl:h-56">
                    {thumbnail ? (
                      <img
                        src={thumbnail}
                        alt={streamId}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <Car className="h-8 w-8 text-muted-foreground 3xl:h-10 3xl:w-10 4xl:h-12 4xl:w-12" />
                    )}
                    <Badge
                      variant="destructive"
                      className="absolute top-1.5 left-1.5 text-[11px] 3xl:text-xs 4xl:text-sm"
                    >
                      Live
                    </Badge>
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

export default StreamCarousel
