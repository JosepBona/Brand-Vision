import { Card } from "@/components/ui/card"
import image_3 from "@/assets/image_3.jpg"
import type { HeroBrandVisionProps } from "@/types/brand-vision-page"

// Hero: titulo + stats por marca, con la ilustracion como fondo de la propia
// Card (background-image, cover) en vez de un <img> flotando a la derecha.
// Un scrim (gradiente bg-card -> transparente) se apila encima de la imagen
// para que el texto de la izquierda siga legible sobre el fondo.
export function HeroBrandVision({ brandStats }: HeroBrandVisionProps) {
  return (
    <Card
      className="relative min-h-52 gap-0 bg-cover p-1 sm:min-h-64 lg:min-h-80"
      style={{
        backgroundImage: `linear-gradient(to right, var(--card) 30%, oklch(from var(--card) l c h / 0.4) 65%, transparent 90%), url(${image_3})`,
      }}
    >
      <div className=" relative z-10 flex max-w-sm flex-col gap-2 p-4 sm:p-6">
        <h1
          className="bg-clip-text font-heading text-4xl font-bold text-transparent"
          style={{
            backgroundImage:
              "linear-gradient(135deg, oklch(0.68 0.26 255), oklch(0.72 0.28 350))",
          }}
        >
          Brand Vision
        </h1>
        <p className="opacity-80">
          Find the vehicle brand you're looking for — powered by computer
          vision technology.
        </p>

        <div>
          <p className="text-xs text-muted-foreground">
            Number of detections
          </p>
          <p
            className="bg-clip-text text-4xl font-bold text-transparent drop-shadow-[0_0_14px_oklch(0.68_0.26_255_/_55%)]"
            style={{ backgroundImage: "var(--gradient-teal-blue)" }}
          >
            {brandStats.total.toLocaleString("en-US")}
          </p>
        </div>

        <div className="max-w-xs ">
          <p className="mb-2 text-xs text-muted-foreground ">
            Total Activity
          </p>
          <div className="flex h-2 w-full overflow-hidden rounded-full bg-muted">
            {brandStats.top.map((brand) => (
              <div
                key={brand.marca}
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
          // grid-flow-col + grid-rows-3: maximo 3 marcas por columna, las
          // columnas siguientes se apilan a la derecha en vez de seguir
          // creciendo la lista hacia abajo sin limite. Recortado a las 9
          // marcas con mas detecciones para que la leyenda no crezca sin
          // fin conforme aparecen mas marcas.
          <div className="opacity-90 mt-2.5 grid w-fit auto-cols-max grid-flow-col grid-rows-3 gap-x-5 gap-y-1 rounded-lg bg-background/80 p-3 backdrop-blur-sm">
            {brandStats.top.slice(0, 9).map((brand) => (
              <div
                key={brand.marca}
                className="flex w-36 items-center justify-between gap-4 text-xs"
              >
                <span className="flex items-center gap-1.5 capitalize">
                  <span
                    className="h-1.5 w-1.5 shrink-0 rounded-full"
                    style={{ backgroundColor: brand.color }}
                  />
                  {brand.marca}
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
