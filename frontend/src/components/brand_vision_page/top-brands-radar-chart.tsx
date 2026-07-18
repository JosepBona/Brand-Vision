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

// Datos de muestra: solo se usan cuando todavia no hay ninguna deteccion
// real (ni de esta sesion ni persistida), para que el chart no se vea
// vacio/roto antes de arrancar una deteccion por primera vez.
const DUMMY_TOP_BRANDS_RADAR = [
  { marca: "toyota", count: 24 },
  { marca: "ford", count: 18 },
  { marca: "honda", count: 15 },
  { marca: "chevrolet", count: 12 },
  { marca: "nissan", count: 9 },
  { marca: "jeep", count: 6 },
]

const chartConfig = {
  count: {
    label: "Detections",
    color: "var(--chart-4)",
  },
} satisfies ChartConfig

export function TopBrandsRadarChart({ topBrands }: TopBrandsRadarChartProps) {
  // Top 6 marcas por numero de detecciones, mismo dato que "Total Activity"
  // (topBrands: persistido + sesion actual) pero recortado a 6 para que el
  // radar no se sature de ejes.
  const brands = topBrands.slice(0, 6).map((b) => ({ marca: b.marca, count: b.count }))
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
              content={<ChartTooltipContent nameKey="marca" />}
            />
            <PolarAngleAxis
              dataKey="marca"
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
