import { cn } from "@pleadli/ui/lib/utils"
import { isTauri } from "@tauri-apps/api/core"
import { getCurrentWindow } from "@tauri-apps/api/window"
import { m } from '@/paraglide/messages'

export const Controls = () => {
    if (typeof window === 'undefined' || !isTauri()) return null
    const frame = getCurrentWindow()

    return (
        <section className='flex items-center gap-1'>
            <span
                title={m.ui_minimize()}
                onClick={() => frame.minimize()}
                className={cn(
                    'bg-olive-500/80 rounded-full size-4 cursor-pointer',
                    'transition-all hover:bg-olive-500 hover:scale-110',
                    'transition-colors duration-200 shadow hover:shadow-md'
                )}
            />
            <span
                title={m.ui_maximize()}
                onClick={() => frame.toggleMaximize()}
                className={cn(
                    'bg-yellow-500/80 rounded-full size-4 cursor-pointer',
                    'transition-all hover:bg-yellow-500 hover:scale-110',
                    'transition-colors duration-200 shadow hover:shadow-md'
                )}
            />
            <span
                title={m.ui_close()}
                onClick={() => frame.close()}
                className={cn(
                    'bg-red-500/80 rounded-full size-4 cursor-pointer',
                    'transition-all hover:bg-red-500 hover:scale-110',
                    'transition-colors duration-200 shadow hover:shadow-md'
                )}
            />
        </section>
    )
}