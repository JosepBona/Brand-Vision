import { Loader2, Play, Square } from "lucide-react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import type { DetectionActionBarProps } from "@/projects/brand-vision/types"

export function DetectionActionBar({
  status,
  isRunning,
  canStart,
  onToggle,
  streamCount,
  brandCount,
}: DetectionActionBarProps) {
  return (
    <div className="-mt-3 flex items-center gap-3">
      <Button
        className={cn(
          "flex-1 gap-2 border-0 text-white",
          !isRunning && "shadow-[0_0_20px_oklch(0.68_0.26_255_/_50%)]"
        )}
        style={
          isRunning
            ? undefined
            : { backgroundImage: "var(--gradient-teal-blue)" }
        }
        variant={isRunning ? "destructive" : "default"}
        disabled={!isRunning && !canStart}
        onClick={onToggle}
      >
        {status === "starting" ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : isRunning ? (
          <Square className="h-4 w-4" />
        ) : (
          <Play className="h-4 w-4" />
        )}
        {status === "starting"
          ? "Starting…"
          : isRunning
            ? "Stop detection"
            : "Start detection"}
      </Button>
      <span className="text-sm whitespace-nowrap text-muted-foreground">
        {streamCount} stream · {brandCount} brands · {status}
      </span>
    </div>
  )
}

export default DetectionActionBar
