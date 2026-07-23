import { useState } from "react"
import { ChevronLeft, ChevronRight, DownloadIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import type {
  DetectionHistoryTableProps,
  ImageWithDownloadProps,
} from "@/projects/brand-vision/types"

const HISTORY_PAGE_SIZE = 5

function formatDate(timestamp?: string) {
  if (!timestamp) return "—"
  const date = new Date(timestamp)
  if (Number.isNaN(date.getTime())) return timestamp
  return date.toLocaleString("en-US", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

function safeFilename(brand: string | undefined, timestamp: string | undefined, ext: string) {
  const label = brand ?? "vehicle"
  const ts = (timestamp ?? "").replace(/[:.]/g, "-")
  return `${label}_${ts}${ext}`
}

function ImageWithDownload({
  src,
  alt,
  filename,
  className,
}: ImageWithDownloadProps) {
  return (
    <div className="group relative mx-auto inline-block">
      <img src={src} alt={alt} className={className} />
      {/* src is a data URI (same-origin by definition, not a resource
          served over HTTP on another port), so the native "download"
          attribute works directly - no longer need the fetch+blob
          workaround that used to be required to force cross-origin
          downloads. */}
      <a
        href={src}
        download={filename}
        aria-label={`Download ${alt}`}
        className="absolute right-1 bottom-1 rounded-full bg-black/60 p-1 text-white opacity-0 transition-opacity group-hover:opacity-100 hover:bg-black/80"
      >
        <DownloadIcon className="h-3.5 w-3.5" />
      </a>
    </div>
  )
}

export function DetectionHistoryTable({ matches }: DetectionHistoryTableProps) {
  const [historyPage, setHistoryPage] = useState(0)

  const historyPageCount = Math.max(
    1,
    Math.ceil(matches.length / HISTORY_PAGE_SIZE)
  )
  const safeHistoryPage = Math.min(historyPage, historyPageCount - 1)
  const pagedMatches = matches.slice(
    safeHistoryPage * HISTORY_PAGE_SIZE,
    safeHistoryPage * HISTORY_PAGE_SIZE + HISTORY_PAGE_SIZE
  )

  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-sm font-medium">Detection history</h2>
      <div className="overflow-hidden rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow className="opacity-70" style={{ background: "var(--gradient-teal-blue)" }}>
              <TableHead className="text-center">Brand</TableHead>
              <TableHead className="text-center">Confidence</TableHead>
              <TableHead className="hidden text-center sm:table-cell">Date</TableHead>
              <TableHead className="hidden text-center sm:table-cell">Original image</TableHead>
              <TableHead className="text-center">Cropped image</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {matches.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={3}
                  className="py-6 text-center text-muted-foreground sm:hidden"
                >
                  No detections recorded yet.
                </TableCell>
                <TableCell
                  colSpan={5}
                  className="hidden py-6 text-center text-muted-foreground sm:table-cell"
                >
                  No detections recorded yet.
                </TableCell>
              </TableRow>
            ) : (
              pagedMatches.map((match, idx) => (
                <TableRow key={`${match.timestamp}-${idx}`}>
                  <TableCell className="text-center font-medium capitalize">
                    {match.brand ?? "—"}
                  </TableCell>
                  <TableCell className="text-center">
                    {match.confidence != null
                      ? `${(match.confidence * 100).toFixed(0)}%`
                      : "—"}
                  </TableCell>
                  <TableCell className="hidden text-center sm:table-cell">
                    {formatDate(match.timestamp)}
                  </TableCell>
                  <TableCell className="hidden text-center sm:table-cell">
                    {match.frame_data ? (
                      <ImageWithDownload
                        src={`data:image/jpeg;base64,${match.frame_data}`}
                        alt="Original frame"
                        filename={safeFilename(match.brand, match.timestamp, ".jpg")}
                        className="mx-auto h-24 w-36 rounded bg-muted object-contain"
                      />
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell className="text-center">
                    {match.crop_data ? (
                      <ImageWithDownload
                        src={`data:image/png;base64,${match.crop_data}`}
                        alt="Cropped vehicle"
                        filename={safeFilename(match.brand, match.timestamp, ".png")}
                        className="mx-auto h-24 w-36 rounded bg-muted object-contain"
                      />
                    ) : (
                      "—"
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {matches.length > 0 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            Page {safeHistoryPage + 1} of {historyPageCount} ·{" "}
            {matches.length} detections
          </span>
          <div className="flex gap-1.5">
            <Button
              variant="outline"
              size="icon-xs"
              onClick={() => setHistoryPage((p) => Math.max(0, p - 1))}
              disabled={safeHistoryPage === 0}
              aria-label="Previous page"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="icon-xs"
              onClick={() =>
                setHistoryPage((p) => Math.min(historyPageCount - 1, p + 1))
              }
              disabled={safeHistoryPage >= historyPageCount - 1}
              aria-label="Next page"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

export default DetectionHistoryTable
