import { useEffect, useMemo, useState } from "react"
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip as RechartsTooltip } from "recharts"

import { Card } from "@/components/ui/card"
import { brandColor } from "@/projects/brand-vision/components/brand-color"
import type { HighConfidenceChartProps } from "@/projects/brand-vision/types"

// ResponsiveContainer only resizes the SVG via ResizeObserver, which
// doesn't react to height changes made by Tailwind breakpoints (they're
// pure CSS, not an actual container resize). The chart height is derived
// directly from the window width so it scales with the same 3xl/4xl
// breakpoints as the rest of the layout.
function usePieChartHeight() {
  const [height, setHeight] = useState(() =>
    typeof window === "undefined"
      ? 140
      : window.innerWidth >= 2560
        ? 260
        : window.innerWidth >= 1920
          ? 220
          : 140
  )
  useEffect(() => {
    const onResize = () => {
      setHeight(
        window.innerWidth >= 2560 ? 260 : window.innerWidth >= 1920 ? 220 : 140
      )
    }
    window.addEventListener("resize", onResize)
    return () => window.removeEventListener("resize", onResize)
  }, [])
  return height
}

// Sample data: only used when there's no real detection yet (neither in
// this session nor persisted), so the chart doesn't look empty/broken
// before starting a detection for the first time.
const DUMMY_HIGH_CONFIDENCE_BRANDS = [
  { brand: "toyota", count: 8, color: brandColor(0) },
  { brand: "ford", count: 5, color: brandColor(1) },
  { brand: "honda", count: 3, color: brandColor(2) },
  { brand: "chevrolet", count: 2, color: brandColor(3) },
]

export function HighConfidenceChart({ matches, topBrands }: HighConfidenceChartProps) {
  // Brand distribution ONLY among matches from THIS session with
  // confidence > 90%: per-detection confidence only travels in the
  // WebSocket's "match" events, not in the persisted total, so this chart
  // can't be extended with history. Colors are reused from topBrands so
  // the same brand shows the same color across the whole page.
  const brands = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const match of matches) {
      if (!match.brand || match.confidence == null || match.confidence <= 0.9) continue
      counts[match.brand] = (counts[match.brand] ?? 0) + 1
    }
    const colorByBrand = Object.fromEntries(
      topBrands.map((b) => [b.brand, b.color])
    )
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .map(([brand, count], idx) => ({
        brand,
        count,
        color: colorByBrand[brand] ?? brandColor(idx),
      }))
  }, [matches, topBrands])

  const displayBrands = brands.length > 0 ? brands : DUMMY_HIGH_CONFIDENCE_BRANDS
  const chartHeight = usePieChartHeight()

  return (
    <Card className="relative gap-2 overflow-hidden p-3">
      <div
        className="pointer-events-none absolute inset-0 opacity-25"
        style={{
          backgroundImage:
            "radial-gradient(circle at 100% 0%, var(--chart-4), transparent 60%)",
        }}
      />
      <p className="relative z-10 text-xs text-muted-foreground 3xl:text-sm">
        High-confidence brands (&gt;90%)
      </p>
      {displayBrands.length > 0 ? (
        <ResponsiveContainer className="relative z-10" width="100%" height={chartHeight}>
          <PieChart>
            <Pie
              data={displayBrands}
              dataKey="count"
              nameKey="brand"
              innerRadius="55%"
              outerRadius="90%"
              paddingAngle={2}
              strokeWidth={0}
              fillOpacity={0.55}
              isAnimationActive={false}
            >
              {displayBrands.map((d) => (
                <Cell key={d.brand} fill={d.color} />
              ))}
            </Pie>
            <RechartsTooltip
              contentStyle={{
                background: "var(--card)",
                border: "1px solid var(--border)",
                borderRadius: 8,
                fontSize: 12,
              }}
              formatter={(value, brand) => [value, brand]}
            />
          </PieChart>
        </ResponsiveContainer>
      ) : (
        <p className="relative z-10 py-8 text-center text-xs text-muted-foreground">
          No detections above 90% confidence yet.
        </p>
      )}
    </Card>
  )
}

export default HighConfidenceChart
