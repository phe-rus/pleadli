import { AddRecordPanel } from "@/components/add-record-panel"
import { CommandMenu } from "@/components/command-menu"
import { DevRoleSwitch } from "@/components/dev-role-switch"
import { useHqConfig, usePermissions } from "@/features/session"
import { useWorkspace } from "@/features/workspace/tabs-store"
import { AddCircleIcon, PanelLeftDashedIcon, PanelRightDashedIcon, Search } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { Button, buttonVariants } from "@pleadli/ui/button"
import { cn } from "@pleadli/ui/lib/utils"
import { useSidebar } from "@pleadli/ui/sidebar"
import { useEffect } from "react"
import { Toggletheme } from "../toggle-theme"
import { Breadcrumbs } from "./breadcrumbs"
import { Controls } from "./controls"

export const Headers = () => {
    const { open, setOpen } = useSidebar()
    const { commandOpen, setCommandOpen, contextOpen, setContextOpen } = useWorkspace()
    const { data: hqConfig } = useHqConfig()
    // Head Office has no prisoners or visits of its own: every prisoner it
    // ever holds comes from a synced facility (spec: docs/specs/prisons/
    // 0001-head-office-peer-sync-network/0003-sync-protocol-and-head-
    // office-management.md, AC-5). Its own officer creation lives on
    // `/officers` instead of this global panel.
    const { can, session } = usePermissions()
    // Until the session loads nothing is hidden; the node refuses either way.
    const canAddRecords = !hqConfig?.isHeadOffice && (!session || can('prisoner.read'))
    const canSearch = !session || can('prisoner.read') || can('hq.locate')

    useEffect(() => {
        const handler = (event: KeyboardEvent) => {
            if (canSearch && (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
                event.preventDefault()
                setCommandOpen((prev) => !prev)
            }
        }
        window.addEventListener('keydown', handler)
        return () => window.removeEventListener('keydown', handler)
    }, [canSearch, setCommandOpen])

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
                                className='size-4!'
                                icon={open ? PanelLeftDashedIcon : PanelRightDashedIcon}
                            />
                        </Button>
                        <Breadcrumbs />
                    </nav>
                </div>

                <nav data-tauri-drag-region className='flex items-center gap-1'>
                    {canSearch && (
                        <>
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
                        </>
                    )}

                    <Button
                        size='icon-sm'
                        variant='ghost'
                        onClick={() => setContextOpen(!contextOpen)}
                        className='group/icon cursor-pointer'
                        aria-label={contextOpen ? 'Hide context panel' : 'Show context panel'}
                        title={contextOpen ? 'Hide context panel' : 'Show context panel'}
                    >
                        <HugeiconsIcon className='size-4!' icon={PanelRightDashedIcon} />
                    </Button>

                    {canAddRecords && (
                        <AddRecordPanel
                            trigger={
                                <button className={cn(buttonVariants({ size: 'sm' }))}>
                                    <HugeiconsIcon icon={AddCircleIcon} />
                                    Add record
                                </button>
                            }
                        />
                    )}

                    {import.meta.env.DEV && <DevRoleSwitch />}
                    <Toggletheme />
                    <Controls />
                </nav>
            </section>
        </header >
    )
}