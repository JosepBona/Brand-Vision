import type { DetectionEvent, DetectionStatus } from "@/hooks/useVehicleDetection"

export interface StreamPlayerProps {
  url: string
  className?: string
  onFirstFrame?: (ms: number) => void
}

export interface BrandStat {
  marca: string
  count: number
  pct: number
  color: string
}

export interface HeroBrandVisionProps {
  brandStats: {
    total: number
    top: BrandStat[]
  }
}

export interface StreamCarouselProps {
  streams: string[]
  streamUrls: Record<string, string>
  isRunning: boolean
  selectedStream: string
  onSelectStream: (id: string) => void
  secondsToNextCapture: number
  onFirstFrame: () => void
}

export interface BrandFilterProps {
  brands: string[]
  selected: string[]
  onChange: (brands: string[]) => void
  disabled: boolean
}

export interface DetectionActionBarProps {
  status: DetectionStatus
  isRunning: boolean
  canStart: boolean
  onToggle: () => void
  streamCount: number
  brandCount: number
}

export interface HighConfidenceChartProps {
  matches: DetectionEvent[]
  topBrands: { marca: string; color: string }[]
}

export interface TopBrandsRadarChartProps {
  topBrands: { marca: string; count: number }[]
}

export interface LastCapturePanelProps {
  events: DetectionEvent[]
  mediaUrl: (relativePath: string) => string
  detectedMediaUrl: (filename: string) => string
}

export interface CaptureImageProps {
  src: string
  alt: string
}

export interface DetectionHistoryTableProps {
  matches: DetectionEvent[]
  mediaUrl: (relativePath: string) => string
}

export interface ImageWithDownloadProps {
  src: string
  alt: string
  filename: string
  className?: string
}
