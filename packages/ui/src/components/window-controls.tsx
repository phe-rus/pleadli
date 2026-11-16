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

/** Shared window chrome. The visible lights are 18px; each hit area is 32px.
 * Native actions and window state remain the responsibility of the host app. */
export function WindowControls({ focused, maximized = false, labels, onClose, onMinimize, onToggleMaximize, className }: WindowControlsProps) {
  const actions = [
    { key: 'close', label: labels.close, colour: 'bg-[#ff5f57]', run: onClose, glyph: <path d="M4 4 10 10M10 4 4 10" /> },
    { key: 'minimize', label: labels.minimize, colour: 'bg-[#febc2e]', run: onMinimize, glyph: <path d="M3.5 7h7" /> },
    { key: 'maximize', label: maximized ? (labels.restore ?? labels.maximize) : labels.maximize, colour: 'bg-[#28c840]', run: onToggleMaximize,
      glyph: maximized
        ? <path d="M2.75 6.5h3.75V2.75zM11.25 7.5H7.5v3.75z" className="fill-current stroke-none" />
        : <path d="M2.75 6.5V2.75H6.5zM11.25 7.5v3.75H7.5z" className="fill-current stroke-none" /> },
  ]

  return (
    <div role="group" aria-label={labels.group} className={cn('flex shrink-0 items-center', className)}>
      {actions.map(({ key, label, colour, run, glyph }) => (
        <button
          key={key}
          type="button"
          aria-label={label}
          title={label}
          onClick={run}
          className="group/light flex size-8 shrink-0 items-center justify-center rounded-full outline-none transition-colors hover:bg-foreground/[0.06] active:bg-foreground/10 focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
        >
          <span className={cn('flex size-4.5 items-center justify-center rounded-full ring-1 ring-black/15 ring-inset', focused ? colour : 'bg-foreground/20')}>
            <svg viewBox="0 0 14 14" className={cn('size-3.5 fill-none stroke-[1.5] [stroke-linecap:round] [stroke-linejoin:round]', focused ? 'stroke-black/75 text-black/75' : 'stroke-foreground/70 text-foreground/70')} aria-hidden="true">
              {glyph}
            </svg>
          </span>
        </button>
      ))}
    </div>
  )
}
