import { cn } from '@pleadli/ui/lib/utils'
import { isTauri } from '@tauri-apps/api/core'
import { getCurrentWindow } from '@tauri-apps/api/window'

const EDGES = [
    { direction: 'North', className: 'top-0 left-2 right-2 h-1 cursor-n-resize' },
    { direction: 'South', className: 'bottom-0 left-2 right-2 h-1 cursor-s-resize' },
    { direction: 'East', className: 'top-2 bottom-2 right-0 w-1 cursor-e-resize' },
    { direction: 'West', className: 'top-2 bottom-2 left-0 w-1 cursor-w-resize' },
    { direction: 'NorthEast', className: 'top-0 right-0 size-2 cursor-ne-resize' },
    { direction: 'NorthWest', className: 'top-0 left-0 size-2 cursor-nw-resize' },
    { direction: 'SouthEast', className: 'bottom-0 right-0 size-2 cursor-se-resize' },
    { direction: 'SouthWest', className: 'bottom-0 left-0 size-2 cursor-sw-resize' },
] as const

/**
 * `decorations: false` means the OS doesn't draw resize grips for this window,
 * so we provide our own edge/corner handles via Tauri's startResizeDragging.
 */
export function WindowResizeHandles() {
    if (typeof window === 'undefined' || !isTauri()) return null
    const frame = getCurrentWindow()

    return (
        <>
            {EDGES.map(({ direction, className }) => (
                <div
                    key={direction}
                    className={cn('fixed z-50', className)}
                    onPointerDown={(e) => {
                        if (e.button !== 0) return
                        e.preventDefault()
                        frame.startResizeDragging(direction)
                    }}
                />
            ))}
        </>
    )
}