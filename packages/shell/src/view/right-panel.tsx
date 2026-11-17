import { ArrowExpandDiagonal01Icon, ArrowShrink02Icon, Cancel01Icon, SquareLock02Icon, SquareUnlock02Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Button } from '@pleadli/ui/button'
import { cn } from '@pleadli/ui/lib/utils'
import { useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react'
import { RIGHT_DEFAULT, RIGHT_MAX, RIGHT_MIN, clampRight } from '../model'

const RIGHT_WIDE = 576
/** Past this width the panel counts as widened, so the button offers to bring it back. */
const WIDE_FROM = (RIGHT_DEFAULT + RIGHT_WIDE) / 2
const KEY_STEP = 16

export type RightPanelLabels = { title: string; open: string; close: string; lock: string; unlock: string; resize: string; widen: string; narrow: string }

/** The right panel: a full height column with a header of its own. Opening it
 * pushes the centre inward; closing lets the centre grow back. Drag its left
 * edge (or use the arrow keys on it) to size it between 320 and 720 pixels,
 * widen it with one click, or lock it so it stays open from tab to tab.
 * `controls` are the window's own buttons, which live in the rightmost header. */
export function RightPanelFrame({
  open,
  width,
  locked,
  labels,
  headerStart,
  controls,
  onWidth,
  onToggleLock,
  onClose,
  children,
}: {
  open: boolean
  width: number
  locked: boolean
  labels: RightPanelLabels
  headerStart?: ReactNode
  controls?: ReactNode
  onWidth: (width: number) => void
  onToggleLock: () => void
  onClose: () => void
  children: ReactNode
}) {
  const asideRef = useRef<HTMLElement>(null)
  // While the edge is dragged the width follows the pointer without being saved
  // on every move; it is saved once, on release.
  const [dragWidth, setDragWidth] = useState<number | null>(null)
  const shown = dragWidth ?? width
  const wide = width >= WIDE_FROM

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const aside = asideRef.current
    if (dragWidth === null || !aside) return
    setDragWidth(clampRight(aside.getBoundingClientRect().right - event.clientX))
  }
  const endDrag = () => {
    if (dragWidth !== null) onWidth(dragWidth)
    setDragWidth(null)
  }
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
    event.preventDefault()
    onWidth(width + (event.key === 'ArrowLeft' ? KEY_STEP : -KEY_STEP))
  }
  const button = (label: string, onClick: () => void, icon: typeof Cancel01Icon, pressed?: boolean) => (
    <Button size="icon-sm" variant="ghost" onClick={onClick} aria-label={label} title={label} aria-pressed={pressed} className="cursor-pointer">
      <HugeiconsIcon icon={icon} className="size-4" />
    </Button>
  )

  return (
    <aside
      ref={asideRef}
      aria-label={labels.title}
      inert={!open}
      style={{ width: open ? shown : 0 }}
      className={cn(
        'relative max-w-[70vw] shrink-0 overflow-hidden bg-background print:hidden!',
        dragWidth === null && 'transition-[width] duration-(--shell-motion-panel) ease-out motion-reduce:transition-none',
        open && 'border-l border-border/20',
      )}
    >
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label={labels.resize}
        aria-valuemin={RIGHT_MIN}
        aria-valuemax={RIGHT_MAX}
        aria-valuenow={shown}
        tabIndex={0}
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId)
          setDragWidth(width)
        }}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onKeyDown={onKeyDown}
        className="absolute inset-y-0 left-0 z-20 w-1 cursor-col-resize touch-none outline-none transition-colors hover:bg-primary/40 focus-visible:bg-primary/60 active:bg-primary/60 motion-reduce:transition-none"
      />
      <div style={{ width: shown }} className="flex h-full flex-col">
        <header data-tauri-drag-region className="flex h-12 shrink-0 items-center gap-1 border-b border-border/40 bg-background pr-2 pl-3">
          {headerStart ?? <span className="truncate text-sm font-medium">{labels.title}</span>}
          <div data-tauri-drag-region className="h-full min-w-2 flex-1" />
          {button(locked ? labels.unlock : labels.lock, onToggleLock, locked ? SquareLock02Icon : SquareUnlock02Icon, locked)}
          {button(wide ? labels.narrow : labels.widen, () => onWidth(wide ? RIGHT_DEFAULT : RIGHT_WIDE), wide ? ArrowShrink02Icon : ArrowExpandDiagonal01Icon)}
          {button(labels.close, onClose, Cancel01Icon)}
          {controls}
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
      </div>
    </aside>
  )
}
