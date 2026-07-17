import { useMemo } from "react"
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip as RechartsTooltip } from "recharts"

import { Card } from "@/components/ui/card"
import { brandColor } from "@/components/brand_vision_page/brand-color"
import type { HighConfidenceChartProps } from "@/types/brand-vision-page"

// Datos de muestra: solo se usan cuando todavia no hay ninguna deteccion
// real (ni de esta sesion ni persistida), para que el chart no se vea
// vacio/roto antes de arrancar una deteccion por primera vez.
const DUMMY_HIGH_CONFIDENCE_BRANDS = [
  { marca: "toyota", count: 8, color: brandColor(0) },
  { marca: "ford", count: 5, color: brandColor(1) },
  { marca: "honda", count: 3, color: brandColor(2) },
  { marca: "chevrolet", count: 2, color: brandColor(3) },
]

export function HighConfidenceChart({ matches, topBrands }: HighConfidenceChartProps) {
  // Distribucion de marcas SOLO entre matches de ESTA sesion con confianza
  // > 90%: la confianza por deteccion solo viaja en los eventos "match" del
  // WebSocket, no en el total persistido, asi que este grafico no se puede
  // ampliar con el historico. Los colores se reusan de topBrands para que
  // la misma marca se vea del mismo color en toda la pagina.
  const brands = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const match of matches) {
      if (!match.marca || match.confianza == null || match.confianza <= 0.9) continue
      counts[match.marca] = (counts[match.marca] ?? 0) + 1
    }
    const colorByMarca = Object.fromEntries(
      topBrands.map((b) => [b.marca, b.color])
    )
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .map(([marca, count], idx) => ({
        marca,
        count,
        color: colorByMarca[marca] ?? brandColor(idx),
      }))
  }, [matches, topBrands])

  const displayBrands = brands.length > 0 ? brands : DUMMY_HIGH_CONFIDENCE_BRANDS

  return (
    <Card className="relative gap-2 overflow-hidden p-3">
      <div
        className="pointer-events-none absolute inset-0 opacity-25"
        style={{
          backgroundImage:
            "radial-gradient(circle at 100% 0%, var(--chart-4), transparent 60%)",
        }}
      />
      <p className="relative z-10 text-xs text-muted-foreground">
        High-confidence brands (&gt;90%)
      </p>
      {displayBrands.length > 0 ? (
        <ResponsiveContainer className="relative z-10" width="100%" height={140}>
          <PieChart>
            <Pie
              data={displayBrands}
              dataKey="count"
              nameKey="marca"
              innerRadius={32}
              outerRadius={52}
              paddingAngle={2}
              strokeWidth={0}
              fillOpacity={0.55}
              isAnimationActive={false}
            >
              {displayBrands.map((d) => (
                <Cell key={d.marca} fill={d.color} />
              ))}
            </Pie>
            <RechartsTooltip
              contentStyle={{
                background: "var(--card)",
                border: "1px solid var(--border)",
                borderRadius: 8,
                fontSize: 12,
              }}
              formatter={(value, marca) => [value, marca]}
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
