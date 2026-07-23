import type { DetectionEvent, DetectionStatus } from "@/projects/brand-vision/hooks/useVehicleDetection"

export interface StreamPlayerProps {
  url: string
  className?: string
  onFirstFrame?: (ms: number) => void
  // How many seconds between cropping a frame from the <video> to send
  // for detection. If onFrameCapture is omitted, nothing is captured
  // (it just plays).
  captureIntervalSeconds?: number
  onFrameCapture?: (dataUrl: string) => void
}

export interface BrandStat {
  brand: string
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
  onFirstFrame: (ms: number) => void
  captureIntervalSeconds: number
  onFrameCapture: (dataUrl: string) => void
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
  topBrands: { brand: string; color: string }[]
}

export interface TopBrandsRadarChartProps {
  topBrands: { brand: string; count: number }[]
}

export interface LastCapturePanelProps {
  events: DetectionEvent[]
}

export interface CaptureImageProps {
  src: string
  alt: string
}

export interface DetectionHistoryTableProps {
  matches: DetectionEvent[]
}

export interface ImageWithDownloadProps {
  src: string
  alt: string
  filename: string
  className?: string
}
