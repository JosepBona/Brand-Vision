const BRAND_COLOR_BASE_HUE = 350
const BRAND_COLOR_HUE_STEP = 137.508

// Golden angle (137.508deg) so the hue never repeats no matter how many
// brands there are, keeping saturation/lightness fixed so all colors
// look like the same "family" as the original chart palette.
export function brandColor(idx: number): string {
  const hue = (BRAND_COLOR_BASE_HUE + idx * BRAND_COLOR_HUE_STEP) % 360
  // chroma bumped from 0.16 to 0.24 (neon touch, more saturated)
  return `oklch(0.72 0.24 ${hue.toFixed(1)})`
}
