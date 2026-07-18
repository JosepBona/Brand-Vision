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
} from "@/types/brand-vision-page"

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

function safeFilename(marca: string | undefined, timestamp: string | undefined, ext: string) {
  const label = marca ?? "vehicle"
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
      {/* src es un data URI (mismo origen por definicion, no un recurso
          servido por HTTP en otro puerto), asi que el atributo "download"
          nativo funciona directo - ya no hace falta el workaround de
          fetch+blob que se necesitaba antes para forzar la descarga
          cross-origin. */}
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
              <TableHead className="text-center">Date</TableHead>
              <TableHead className="text-center">Original image</TableHead>
              <TableHead className="text-center">Cropped image</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {matches.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={5}
                  className="py-6 text-center text-muted-foreground"
                >
                  No detections recorded yet.
                </TableCell>
              </TableRow>
            ) : (
              pagedMatches.map((match, idx) => (
                <TableRow key={`${match.timestamp}-${idx}`}>
                  <TableCell className="text-center font-medium capitalize">
                    {match.marca ?? "—"}
                  </TableCell>
                  <TableCell className="text-center">
                    {match.confianza != null
                      ? `${(match.confianza * 100).toFixed(0)}%`
                      : "—"}
                  </TableCell>
                  <TableCell className="text-center">
                    {formatDate(match.timestamp)}
                  </TableCell>
                  <TableCell className="text-center">
                    {match.frame_data ? (
                      <ImageWithDownload
                        src={`data:image/jpeg;base64,${match.frame_data}`}
                        alt="Original frame"
                        filename={safeFilename(match.marca, match.timestamp, ".jpg")}
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
                        filename={safeFilename(match.marca, match.timestamp, ".png")}
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
