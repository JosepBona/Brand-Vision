const BRAND_COLOR_BASE_HUE = 350
const BRAND_COLOR_HUE_STEP = 137.508

// Angulo dorado (137.508deg) para que el tono nunca se repita sin importar
// cuantas marcas haya, manteniendo saturacion/luminosidad fijas para que
// todos los colores se vean de la misma "familia" que la paleta de charts
// original.
export function brandColor(idx: number): string {
  const hue = (BRAND_COLOR_BASE_HUE + idx * BRAND_COLOR_HUE_STEP) % 360
  // chroma subida de 0.16 a 0.24 (toque neon, mas saturado)
  return `oklch(0.72 0.24 ${hue.toFixed(1)})`
}
