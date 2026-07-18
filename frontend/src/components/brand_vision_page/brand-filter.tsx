import { useRef } from "react"

import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { cn } from "@/lib/utils"
import type { BrandFilterProps } from "@/types/brand-vision-page"

export function BrandFilter({
  brands,
  selected,
  onChange,
  disabled,
}: BrandFilterProps) {
  const brandsScrollerRef = useRef<HTMLDivElement>(null)
  const brandsDrag = useRef({
    startX: 0,
    scrollLeft: 0,
    dragging: false,
    moved: false,
  })

  const allBrandsSelected = brands.length > 0 && selected.length === brands.length

  return (
    <div className="-mt-4 flex flex-col gap-3 4xl:mt-2">
      <h2 className="text-sm font-medium 4xl:text-base">Brands to search</h2>
      <div
        ref={brandsScrollerRef}
        className="cursor-grab [scrollbar-width:none] overflow-x-auto pb-1 select-none [-ms-overflow-style:none] active:cursor-grabbing [&::-webkit-scrollbar]:hidden"
        onPointerDown={(e) => {
          const el = brandsScrollerRef.current
          if (!el) return
          brandsDrag.current = {
            startX: e.clientX,
            scrollLeft: el.scrollLeft,
            dragging: true,
            moved: false,
          }
          // No capturamos el puntero aqui: hacerlo de inmediato reasigna
          // el "click" resultante al wrapper y los toggles dejan de
          // recibirlo. Solo se captura si de verdad se arrastra.
        }}
        onPointerMove={(e) => {
          const el = brandsScrollerRef.current
          const drag = brandsDrag.current
          if (!drag.dragging || !el) return
          const delta = e.clientX - drag.startX
          if (!drag.moved && Math.abs(delta) > 4) {
            drag.moved = true
            el.setPointerCapture(e.pointerId)
          }
          if (drag.moved) el.scrollLeft = drag.scrollLeft - delta
        }}
        onPointerUp={(e) => {
          const el = brandsScrollerRef.current
          brandsDrag.current.dragging = false
          if (el?.hasPointerCapture(e.pointerId)) {
            el.releasePointerCapture(e.pointerId)
          }
        }}
        onClickCapture={(e) => {
          if (brandsDrag.current.moved) {
            e.preventDefault()
            e.stopPropagation()
            brandsDrag.current.moved = false
          }
        }}
      >
        <div className="flex flex-nowrap items-center gap-2">
          <button
            type="button"
            disabled={disabled}
            onClick={() => onChange(allBrandsSelected ? [] : brands)}
            style={
              allBrandsSelected
                ? { backgroundImage: "var(--gradient-purple-pink)" }
                : undefined
            }
            className={cn(
              "shrink-0 rounded-s-full border-2 px-3.5 py-1.5 text-sm font-medium transition-colors hover:bg-muted disabled:pointer-events-none disabled:opacity-50 4xl:px-9 4xl:py-5 4xl:text-xl",
              allBrandsSelected
                ? "border-transparent text-white"
                : "border-input"
            )}
          >
            All
          </button>
          <ToggleGroup
            multiple
            value={selected}
            onValueChange={onChange}
            disabled={disabled}
            className="flex-nowrap gap-2"
          >
            {brands.map((marca) => {
              const active = selected.includes(marca)
              return (
                <ToggleGroupItem
                  key={marca}
                  value={marca}
                  style={
                    active
                      ? { backgroundImage: "var(--gradient-purple-pink)" }
                      : undefined
                  }
                  className={cn(
                    "shrink-0 rounded-s-sm border-2 px-3.5 py-1.5 text-sm capitalize transition-colors 4xl:px-9 4xl:py-5 4xl:text-xl",
                    active
                      ? "border-transparent text-white"
                      : "data-[state=on]:border-primary"
                  )}
                >
                  {marca}
                </ToggleGroupItem>
              )
            })}
          </ToggleGroup>
        </div>
      </div>
    </div>
  )
}

export default BrandFilter
