import { ChevronLeftIcon, ChevronRightIcon, PersonStandingIcon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { Button, buttonVariants } from "@pleadli/ui/button"
import { cn } from "@pleadli/ui/lib/utils"
import { useSidebar } from "@pleadli/ui/sidebar"
import { Link } from "@tanstack/react-router"

export const Headers = () => {
    const { open, setOpen } = useSidebar()

    return (
        <header
            data-tauri-drag-region
            className={cn(
                "sticky top-0 z-10 border-b border-border/15",
                'bg-background/95 backdrop-blur'
            )}>
            <section data-tauri-drag-region className="px-5 flex h-10 items-center justify-between gap-5">
                <div data-tauri-drag-region className="flex items-center gap-5">
                    <nav className='flex items-center gap-1'>
                        <Button
                            size='icon-xs'
                            variant='ghost'
                            onClick={() => setOpen(!open)}
                            className='rounded-full'
                        >
                            {open ? <HugeiconsIcon icon={ChevronLeftIcon} /> : <HugeiconsIcon icon={ChevronRightIcon} />}
                        </Button>
                        <Link to="/" className="flex items-center gap-2 font-bold text-base shrink-0">
                            <img src="/icon.ico" alt="" className="size-5" />
                            Pleadli
                        </Link>
                    </nav>
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