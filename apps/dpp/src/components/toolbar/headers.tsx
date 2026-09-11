import { CommandMenu } from "@/components/command-menu"
import { Createpanel } from "@/components/create-panel"
import { ProsecutionFileForm } from "@/features/prosecution-files"
import { LegalDocument01Icon, PanelLeftDashedIcon, PanelRightDashedIcon, Search } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { Button, buttonVariants } from "@pleadli/ui/button"
import { cn } from "@pleadli/ui/lib/utils"
import { useSidebar } from "@pleadli/ui/sidebar"
import { Suspense, useEffect, useState } from "react"
import { Toggletheme } from "../toggle-theme"
import { Breadcrumbs } from "./breadcrumbs"
import { Controls } from "./controls"

export const Headers = () => {
    const { open, setOpen } = useSidebar()
    const [fileOpen, setFileOpen] = useState(false)
    const [fileDirty, setFileDirty] = useState(false)
    const [commandOpen, setCommandOpen] = useState(false)

    useEffect(() => {
        const handler = (event: KeyboardEvent) => {
            if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
                event.preventDefault()
                setCommandOpen((prev) => !prev)
            }
        }
        window.addEventListener('keydown', handler)
        return () => window.removeEventListener('keydown', handler)
    }, [])

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
                        <Breadcrumbs />
                    </nav>
                </div>

                <nav data-tauri-drag-region className='flex items-center gap-1'>
                    <button
                        type="button"
                        onClick={() => setCommandOpen(true)}
                        className={cn(buttonVariants({ size: 'icon-sm', variant: 'ghost' }))}
                        aria-label="Search (Ctrl+K)"
                        title="Search (Ctrl+K)"
                    >
                        <HugeiconsIcon icon={Search} />
                    </button>

                    <CommandMenu open={commandOpen} onOpenChange={setCommandOpen} />

                    <Createpanel
                        open={fileOpen}
                        onOpenChange={setFileOpen}
                        isDirty={fileDirty}
                        trigger={
                            <button className={cn(buttonVariants({ size: 'sm' }))}>
                                <HugeiconsIcon icon={LegalDocument01Icon} />
                                Open new file
                            </button>
                        }
                        headings={{ title: 'Open file', description: 'Log a matter referred by Police.' }}
                    >
                        <Suspense fallback={<div className="p-4 text-xs text-muted-foreground">Loading…</div>}>
                            <ProsecutionFileForm onSuccess={() => setFileOpen(false)} onDirtyChange={setFileDirty} />
                        </Suspense>
                    </Createpanel>

                    <Toggletheme />
                    <Controls />
                </nav>
            </section>
        </header >
    )
}
