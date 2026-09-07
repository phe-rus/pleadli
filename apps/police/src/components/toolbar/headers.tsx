import { PersonStandingIcon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { buttonVariants } from "@pleadli/ui/button"
import { cn } from "@pleadli/ui/lib/utils"
import { Link } from "@tanstack/react-router"

export const Headers = () => {
    return (
        <header data-tauri-drag-region className="sticky top-0 z-40 border-b border-border/55 bg-background/95 backdrop-blur">
            <section data-tauri-drag-region className="px-5 flex h-10 items-center justify-between gap-5">
                <div data-tauri-drag-region className="flex items-center gap-5">
                    <Link to="/" className="flex items-center gap-2 font-bold text-base shrink-0">
                        <img src="/icon.ico" alt="" className="size-5" />
                        Pleadli
                    </Link>
                </div>

                <nav data-tauri-drag-region className='flex items-center gap-2'>
                    <Link to='/' className={cn(buttonVariants({ variant: 'secondary' }))}>
                        <HugeiconsIcon icon={PersonStandingIcon} />
                        Help us improve
                    </Link>
                </nav>
            </section>
        </header>
    )
}