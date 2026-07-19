import {
  PolarAngleAxis,
  PolarGrid,
  Radar,
  RadarChart,
} from "recharts"

import { Card } from "@/components/ui/card"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"
import type { TopBrandsRadarChartProps } from "@/types/brand-vision-page"

// Sample data: only used when there's no real detection yet (neither in
// this session nor persisted), so the chart doesn't look empty/broken
// before starting a detection for the first time.
const DUMMY_TOP_BRANDS_RADAR = [
  { brand: "toyota", count: 24 },
  { brand: "ford", count: 18 },
  { brand: "honda", count: 15 },
  { brand: "chevrolet", count: 12 },
  { brand: "nissan", count: 9 },
  { brand: "jeep", count: 6 },
]

const chartConfig = {
  count: {
    label: "Detections",
    color: "var(--chart-4)",
  },
} satisfies ChartConfig

export function TopBrandsRadarChart({ topBrands }: TopBrandsRadarChartProps) {
  // Top 6 brands by detection count, same data as "Total Activity"
  // (topBrands: persisted + current session) but trimmed to 6 so the
  // radar doesn't get saturated with axes.
  const brands = topBrands.slice(0, 6).map((b) => ({ brand: b.brand, count: b.count }))
  const isDummy = brands.length === 0
  const displayBrands = isDummy ? DUMMY_TOP_BRANDS_RADAR : brands

  return (
    <Card className="relative gap-2 overflow-hidden p-3">
      <div
        className="pointer-events-none absolute inset-0 opacity-25"
        style={{
          backgroundImage:
            "radial-gradient(circle at 100% 0%, var(--chart-2), transparent 60%)",
        }}
      />
      <p className="relative z-10 text-xs text-muted-foreground 3xl:text-sm">
        Top brands
        {isDummy && " · sample"}
      </p>
      {displayBrands.length > 0 ? (
        <ChartContainer
          config={chartConfig}
          className="relative z-10 mx-auto h-40 w-40 3xl:h-60 3xl:w-60 4xl:h-72 4xl:w-72"
        >
          <RadarChart data={displayBrands}>
            <ChartTooltip
              cursor={false}
              content={<ChartTooltipContent nameKey="brand" />}
            />
            <PolarAngleAxis
              dataKey="brand"
              tick={{ fontSize: 10 }}
              tickFormatter={(value: string) =>
                value.charAt(0).toUpperCase() + value.slice(1)
              }
            />
            <PolarGrid />
            <Radar
              dataKey="count"
              fill="var(--color-count)"
              stroke="var(--color-count)"
              fillOpacity={0.6}
            />
          </RadarChart>
        </ChartContainer>
      ) : (
        <p className="relative z-10 py-8 text-center text-xs text-muted-foreground">
          No detections yet.
        </p>
      )}
    </Card>
  )
}

export default TopBrandsRadarChart
