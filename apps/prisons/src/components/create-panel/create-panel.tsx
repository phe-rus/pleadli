import { Cancel01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { Drawer, DrawerClose, DrawerContent, DrawerDescription, DrawerTitle, DrawerTrigger } from "@pleadli/ui/components/drawer"
import { FC, PropsWithChildren, ReactElement } from "react"
import { m } from '@/paraglide/messages'

type createPanelProps = PropsWithChildren<{
    /** Omit when the panel is opened purely programmatically (e.g. a table
     * row click) via the controlled `open`/`onOpenChange` props. */
    trigger?: ReactElement
    headings: {
        title: string
        description: string
    }
    open?: boolean
    onOpenChange?: (open: boolean) => void
    /** Set only for forms with real work to lose (a statement, a case
     * narrative, a diary entry) — when true, closing via Escape or a
     * backdrop click asks for confirmation first instead of silently
     * discarding unsaved input. A programmatic close after a successful
     * save (calling the parent's own `open` setter directly) never goes
     * through this guard, so a save is never blocked by it. */
    isDirty?: boolean
}>

/** The one side panel for a record form. Its shape is fixed here so no form
 * decides it: flush to the right edge at `--panel-width`, a header with the
 * title and one line of purpose, then the form, which is the scrolling body
 * (`panel-body`) with its own footer pinned to the bottom edge. */
export const Createpanel: FC<createPanelProps> = ({
    trigger,
    headings,
    open,
    onOpenChange,
    isDirty = false,
    children,
}) => {
    const handleOpenChange = (nextOpen: boolean) => {
        if (!nextOpen && isDirty) {
            const discard = window.confirm(m.ui_you_have_unsaved_changes_discard_them())
            if (!discard) return
        }
        onOpenChange?.(nextOpen)
    }

    return (
        <Drawer open={open} onOpenChange={handleOpenChange} swipeDirection="right">
            {trigger && <DrawerTrigger render={trigger} />}
            <DrawerContent className='rounded-none! border-y-0 border-r-0 border-border/35 bg-card! [--drawer-inset:0px] data-[swipe-axis=x]:[--drawer-content-width:var(--panel-width)] data-[swipe-axis=x]:sm:[--drawer-content-width:var(--panel-width)]'>
                <div className='panel-header gap-3'>
                    <div className='flex min-w-0 flex-1 flex-col gap-0.5'>
                        <DrawerTitle>{headings.title}</DrawerTitle>
                        <DrawerDescription>{headings.description}</DrawerDescription>
                    </div>
                    <DrawerClose
                        aria-label={m.ui_close()}
                        className='shrink-0 cursor-pointer rounded-md p-1.5 text-muted-foreground hover:bg-muted/60'
                    >
                        <HugeiconsIcon icon={Cancel01Icon} size={16} />
                    </DrawerClose>
                </div>
                {children}
            </DrawerContent>
        </Drawer>
    )
}
