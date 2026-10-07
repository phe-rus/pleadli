import { cn } from "@pleadli/ui/lib/utils"
import { isTauri } from "@tauri-apps/api/core"
import { getCurrentWindow } from "@tauri-apps/api/window"
import { useEffect, useState } from "react"
import * as m from '@/paraglide/messages'

/** The symbol each button shows when the pointer is over the group, drawn
 * small and dark the way a Mac draws them. */
const glyphs = {
    close: <path d="M3.5 3.5l5 5m0-5l-5 5" />,
    minimize: <path d="M2.75 6h6.5" />,
    zoom: <path d="M3.75 3.75h3.5v.01M3.75 3.75v3.5M8.25 8.25h-3.5M8.25 8.25v-3.5" />,
}

/**
 * The window's own buttons, in the desktop app only: close, minimise and zoom
 * as three small round lights at the top left, the way a Mac window has them.
 * They show their symbols when the pointer is near and turn grey while the
 * window is in the background. In a browser the page has no window to manage,
 * so nothing is drawn.
 */
export const Controls = ({ className }: { className?: string }) => {
    const desktop = typeof window !== 'undefined' && isTauri()
    const [focused, setFocused] = useState(true)

    useEffect(() => {
        if (!desktop) return
        let stop: (() => void) | undefined
        void getCurrentWindow().onFocusChanged(({ payload }) => setFocused(payload)).then((unlisten) => (stop = unlisten))
        return () => stop?.()
    }, [desktop])

    if (!desktop) return null
    const frame = getCurrentWindow()
    const light = (kind: keyof typeof glyphs, label: string, colour: string, onClick: () => void) => (
        <button
            type="button"
            aria-label={label}
            title={label}
            onClick={onClick}
            className={cn(
                'flex size-3 cursor-default items-center justify-center rounded-full ring-1 ring-black/10 ring-inset outline-none focus-visible:ring-2 focus-visible:ring-ring',
                focused ? colour : 'bg-foreground/15',
            )}
        >
            <svg viewBox="0 0 12 12" className="size-2 fill-none stroke-black/60 stroke-[1.4] opacity-0 group-hover/lights:opacity-100" aria-hidden>
                {glyphs[kind]}
            </svg>
        </button>
    )

    return (
        <section aria-label={m["window.controls"]()} className={cn('group/lights flex shrink-0 items-center gap-2', className)}>
            {light('close', m["window.close"](), 'bg-[#ff5f57]', () => void frame.close())}
            {light('minimize', m["window.minimize"](), 'bg-[#febc2e]', () => void frame.minimize())}
            {light('zoom', m["window.maximize"](), 'bg-[#28c840]', () => void frame.toggleMaximize())}
        </section>
    )
}
