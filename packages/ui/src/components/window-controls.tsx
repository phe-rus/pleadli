import { cn } from '@pleadli/ui/lib/utils'

type WindowControlsProps = {
  focused: boolean
  maximized?: boolean
  labels: { group: string; close: string; minimize: string; maximize: string; restore?: string }
  onClose: () => void
  onMinimize: () => void
  onToggleMaximize: () => void
  className?: string
}

/** Shared window chrome. Our own take on the familiar three-key idea: round
 * buttons, each with its own hue (coral to close, amber to tuck away, Pleadli teal to
 * enlarge), 8px apart, each carrying its icon at all times. When
 * the window is not in front the keys are only dimmed, never turned grey, so the
 * three always stay tell-apart-able even if the platform reports focus wrongly.
 * Each hit area is 20px wide and 28px tall. Native actions and window state remain
 * the responsibility of the host app. */
export function WindowControls({ focused, maximized = false, labels, onClose, onMinimize, onToggleMaximize, className }: WindowControlsProps) {
  const actions = [
    { key: 'close', label: labels.close, colour: 'bg-[#e5534b] ring-[#c13b34]', ink: 'text-[#4a0f0c]', run: onClose,
      glyph: <path d="M4 4 10 10M10 4 4 10" /> },
    { key: 'minimize', label: labels.minimize, colour: 'bg-[#eba53a] ring-[#c4831d]', ink: 'text-[#4d3000]', run: onMinimize,
      glyph: <path d="M3.5 7h7" /> },
    // The icons everyone already knows: one square to enlarge, two overlapping squares to restore.
    { key: 'maximize', label: maximized ? (labels.restore ?? labels.maximize) : labels.maximize, colour: 'bg-[#2f9e8f] ring-[#1f7a6d]', ink: 'text-[#032b25]', run: onToggleMaximize,
      glyph: maximized
        ? <path d="M5.25 3.5h5.25v5.25M3.5 5.25h5.25v5.25H3.5z" />
        : <path d="M3.5 3.5h7v7h-7z" /> },
  ]

  return (
    <div role="group" aria-label={labels.group} className={cn('group/keys flex shrink-0 items-center', className)}>
      {actions.map(({ key, label, colour, ink, run, glyph }) => (
        <button
          key={key}
          type="button"
          aria-label={label}
          title={label}
          onClick={run}
          className="relative flex h-7 w-5 shrink-0 items-center justify-center outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span className={cn('flex size-3.5 items-center justify-center rounded-full ring-[0.5px] ring-inset transition-[filter,opacity] active:brightness-90 motion-reduce:transition-none', colour, !focused && 'opacity-60')}>
            <svg viewBox="0 0 14 14" className={cn('size-2.5 fill-none stroke-current stroke-[2] [stroke-linecap:round] [stroke-linejoin:round]', ink)} aria-hidden="true">
              {glyph}
            </svg>
          </span>
        </button>
      ))}
    </div>
  )
}
