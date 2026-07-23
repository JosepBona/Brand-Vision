import { Card } from "@/components/ui/card"
import image_3 from "@/assets/image_3.jpg"
import type { HeroBrandVisionProps } from "@/projects/brand-vision/types"

// Hero: title + per-brand stats, with the illustration as the Card's own
// background (background-image, cover) instead of an <img> floating on the
// right. A scrim (bg-card -> transparent gradient) is layered over the
// image so the text on the left stays legible over the background.
export function HeroBrandVision({ brandStats }: HeroBrandVisionProps) {
  return (
    <Card
      className="relative min-h-52 gap-0 bg-cover p-1 sm:min-h-64 lg:min-h-80 3xl:min-h-[32rem] 4xl:min-h-[38rem]"
      style={{
        backgroundImage: `linear-gradient(to right, var(--card) 30%, oklch(from var(--card) l c h / 0.4) 65%, transparent 90%), url(${image_3})`,
      }}
    >
      <div className=" relative z-10 flex max-w-sm flex-col gap-2 p-4 sm:p-6 3xl:max-w-lg 3xl:gap-3 3xl:p-8 4xl:max-w-2xl 4xl:gap-5 4xl:p-11">
        <h1
          className="bg-clip-text font-heading text-4xl font-bold text-transparent 3xl:text-5xl 4xl:text-7xl"
          style={{
            backgroundImage:
              "linear-gradient(135deg, oklch(0.68 0.26 255), oklch(0.72 0.28 350))",
          }}
        >
          Brand Vision
        </h1>
        <p className="opacity-80 3xl:text-lg 4xl:text-2xl">
          Find the vehicle brand you're looking for — powered by computer
          vision technology.
        </p>

        <div>
          <p className="text-xs text-muted-foreground 3xl:text-sm 4xl:text-lg">
            Number of detections
          </p>
          <p
            className="bg-clip-text text-4xl font-bold text-transparent drop-shadow-[0_0_14px_oklch(0.68_0.26_255_/_55%)] 3xl:text-5xl 4xl:text-7xl"
            style={{ backgroundImage: "var(--gradient-teal-blue)" }}
          >
            {brandStats.total.toLocaleString("en-US")}
          </p>
        </div>

        <div className="max-w-xs 3xl:max-w-sm 4xl:max-w-lg">
          <p className="mb-2 text-xs text-muted-foreground 3xl:text-sm 4xl:text-lg">
            Total Activity
          </p>
          <div className="flex h-2 w-full overflow-hidden rounded-full bg-muted 3xl:h-3 4xl:h-5">
            {brandStats.top.map((brand) => (
              <div
                key={brand.brand}
                className="h-full"
                style={{
                  width: `${brand.pct}%`,
                  backgroundColor: brand.color,
                }}
              />
            ))}
          </div>
        </div>

        {brandStats.top.length > 0 && (
          // grid-flow-col + grid-rows-3: at most 3 brands per column, extra
          // columns stack to the right instead of the list growing downward
          // without limit. Trimmed to the top 9 brands by detection count so
          // the legend doesn't grow unbounded as more brands appear. Mobile
          // only fits 6 (2 columns): the last 3 are hidden via CSS instead of
          // slicing the array, to avoid duplicating markup per breakpoint.
          <div className="opacity-90 mt-2.5 grid w-fit auto-cols-max grid-flow-col grid-rows-3 gap-x-9 gap-y-1 rounded-lg bg-background/80 p-3 backdrop-blur-sm [&>*:nth-child(n+7)]:hidden sm:gap-x-5 sm:[&>*:nth-child(n+7)]:flex 3xl:mt-4 3xl:gap-x-7 3xl:gap-y-2 3xl:p-4 4xl:gap-x-10 4xl:p-6">
            {brandStats.top.slice(0, 9).map((brand) => (
              <div
                key={brand.brand}
                className="flex w-36 items-center justify-between gap-4 text-xs 3xl:w-44 3xl:text-sm 4xl:w-60 4xl:text-lg"
              >
                <span className="flex items-center gap-1.5 capitalize">
                  <span
                    className="h-1.5 w-1.5 shrink-0 rounded-full 3xl:h-2 3xl:w-2"
                    style={{ backgroundColor: brand.color }}
                  />
                  {brand.brand}
                </span>
                <span className="shrink-0 text-muted-foreground">
                  {brand.count.toLocaleString("en-US")} · {brand.pct}%
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </Card>
  )
}

export default HeroBrandVision
