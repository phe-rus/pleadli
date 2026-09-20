import { ArrowExpandDiagonal01Icon, ArrowShrink02Icon, Cancel01Icon, SquareLock02Icon, SquareUnlock02Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Button } from '@pleadli/ui/button'
import { cn } from '@pleadli/ui/lib/utils'
import { useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react'
import { AssistantPanel } from './assistant/assistant-panel'
import { PrisonerContext } from './context-panel'
import { RIGHT_DEFAULT, RIGHT_MAX, RIGHT_MIN, RIGHT_WIDE, useWorkspace, type RightMode } from './tabs-store'
import { m } from '@/paraglide/messages'

/** Past this width the pillar counts as widened, so the button offers to
 * bring it back rather than to widen it further. */
const WIDE_FROM = (RIGHT_DEFAULT + RIGHT_WIDE) / 2
const KEY_STEP = 16

const clamp = (width: number) => Math.min(RIGHT_MAX, Math.max(RIGHT_MIN, width))

function PillarButton({ label, onClick, pressed, children }: { label: string; onClick: () => void; pressed?: boolean; children: ReactNode }) {
  return (
    <Button size="icon-sm" variant="ghost" onClick={onClick} aria-label={label} title={label} aria-pressed={pressed} className="cursor-pointer">
      {children}
    </Button>
  )
}

/** The right pillar: a full-height column with a header of its own. Opening it
 * pushes the centre inward; closing it lets the centre grow back. It holds the
 * assistant on every screen and, on a prisoner's file, that person's context
 * beside it. Drag its left edge (or use the arrow keys on it) to size it, widen
 * it with one click, or lock it so it stays open from tab to tab. `controls`
 * are the window's own buttons, which live in whichever header is rightmost. */
export function RightPanel({ prisonerId, controls }: { prisonerId: string | null; controls: ReactNode }) {
  const { rightOpen, setRightOpen, rightMode, setRightMode, rightWidth, setRightWidth, rightLocked, toggleRightLocked } = useWorkspace()
  const mode: RightMode = rightMode === 'record' && prisonerId ? 'record' : 'assistant'
  const asideRef = useRef<HTMLElement>(null)
  // While the edge is being dragged the width follows the pointer without
  // being saved on every move; it is saved once, on release.
  const [dragWidth, setDragWidth] = useState<number | null>(null)
  const width = dragWidth ?? rightWidth
  const wide = rightWidth >= WIDE_FROM

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const aside = asideRef.current
    if (dragWidth === null || !aside) return
    setDragWidth(clamp(aside.getBoundingClientRect().right - event.clientX))
  }

  const endDrag = () => {
    if (dragWidth !== null) setRightWidth(dragWidth)
    setDragWidth(null)
  }

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
    event.preventDefault()
    setRightWidth(rightWidth + (event.key === 'ArrowLeft' ? KEY_STEP : -KEY_STEP))
  }

  const tab = (value: RightMode, label: string) => (
    <button
      type="button"
      role="tab"
      aria-selected={mode === value}
      onClick={() => setRightMode(value)}
      className={cn(
        'cursor-pointer rounded-sm px-2.5 py-0.5 text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/50 motion-reduce:transition-none',
        mode === value ? 'bg-background font-medium text-foreground shadow-xs' : 'text-muted-foreground hover:text-foreground',
      )}
    >
      {label}
    </button>
  )

  return (
    <aside
      ref={asideRef}
      aria-label={m.shell_right_panel()}
      inert={!rightOpen}
      style={{ width: rightOpen ? width : 0 }}
      className={cn(
        'relative max-w-[70vw] shrink-0 overflow-hidden bg-background print:hidden!',
        dragWidth === null && 'transition-[width] duration-200 ease-out motion-reduce:transition-none',
        rightOpen && 'border-l border-border/20',
      )}
    >
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label={m.shell_resize_panel()}
        aria-valuemin={RIGHT_MIN}
        aria-valuemax={RIGHT_MAX}
        aria-valuenow={width}
        tabIndex={0}
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId)
          setDragWidth(rightWidth)
        }}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onKeyDown={onKeyDown}
        className="absolute inset-y-0 left-0 z-20 w-1 cursor-col-resize touch-none outline-none transition-colors hover:bg-primary/40 focus-visible:bg-primary/60 active:bg-primary/60 motion-reduce:transition-none"
      />
      <div style={{ width }} className="flex h-full flex-col">
        <header data-tauri-drag-region className="flex h-9 shrink-0 items-center gap-1 border-b border-border/20 bg-background pr-2 pl-3">
          <div role="tablist" aria-label={m.shell_right_panel()} className="flex gap-0.5 rounded-md bg-foreground/5 p-0.5">
            {tab('assistant', m.shell_right_assistant())}
            {prisonerId && tab('record', m.shell_right_record())}
          </div>
          <div data-tauri-drag-region className="h-full min-w-2 flex-1" />
          <PillarButton label={rightLocked ? m.shell_unlock_panel() : m.shell_lock_panel()} pressed={rightLocked} onClick={toggleRightLocked}>
            <HugeiconsIcon icon={rightLocked ? SquareLock02Icon : SquareUnlock02Icon} className="size-4" />
          </PillarButton>
          <PillarButton label={wide ? m.shell_narrow_panel() : m.shell_widen_panel()} onClick={() => setRightWidth(wide ? RIGHT_DEFAULT : RIGHT_WIDE)}>
            <HugeiconsIcon icon={wide ? ArrowShrink02Icon : ArrowExpandDiagonal01Icon} className="size-4" />
          </PillarButton>
          <PillarButton label={m.shell_close_panel()} onClick={() => setRightOpen(false)}>
            <HugeiconsIcon icon={Cancel01Icon} className="size-4" />
          </PillarButton>
          {controls}
        </header>
        {mode === 'record' && prisonerId ? rightOpen && <PrisonerContext prisonerId={prisonerId} /> : <AssistantPanel />}
      </div>
    </aside>
  )
}
