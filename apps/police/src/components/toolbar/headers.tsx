import { LegalDocument01Icon, PanelLeftDashedIcon, PanelRightDashedIcon, Search } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { Button, buttonVariants } from "@pleadli/ui/button"
import { cn } from "@pleadli/ui/lib/utils"
import { useSidebar } from "@pleadli/ui/sidebar"
import { Link } from "@tanstack/react-router"
import { Toggletheme } from "../toggle-theme"
import { Controls } from "./controls"

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
                            size='icon-sm'
                            variant='ghost'
                            onClick={() => setOpen(!open)}
                            className='group/icon cursor-pointer'
                        >
                            <HugeiconsIcon
                                icon={open ? PanelLeftDashedIcon : PanelRightDashedIcon}
                            />
                        </Button>
                        <Link to="/" className='text-sm font-semibold'>
                            Pleadli
                        </Link>
                    </nav>
                </div>

                <nav data-tauri-drag-region className='flex items-center gap-1'>
                    <Button
                        size='icon-sm'
                    >
                        <HugeiconsIcon icon={Search} />
                    </Button>
                    <Link to='/' className={cn(buttonVariants({
                        size: 'sm'
                    }))}>
                        <HugeiconsIcon icon={LegalDocument01Icon} />
                        Create new case
                    </Link>
                    <Toggletheme />
                    <Controls />
                </nav>
            </section>
        </header >
    )
}