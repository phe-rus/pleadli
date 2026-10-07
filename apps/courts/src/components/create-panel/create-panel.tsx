import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle, DrawerTrigger } from "@pleadli/ui/components/drawer"
import { FC, PropsWithChildren, ReactElement } from "react"

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
     * narrative, a diary entry), when true, closing via Escape or a
     * backdrop click asks for confirmation first instead of silently
     * discarding unsaved input. A programmatic close after a successful
     * save (calling the parent's own `open` setter directly) never goes
     * through this guard, so a save is never blocked by it. */
    isDirty?: boolean
}>

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
            const discard = window.confirm('You have unsaved changes. Discard them?')
            if (!discard) return
        }
        onOpenChange?.(nextOpen)
    }

    return (
        <Drawer open={open} onOpenChange={handleOpenChange} swipeDirection="right">
            {trigger && <DrawerTrigger render={trigger} />}
            <DrawerContent className='bg-card!'>
                <DrawerHeader className='gap-0!'>
                    <DrawerTitle>{headings.title}</DrawerTitle>
                    <DrawerDescription className='md:max-w-sm'>{headings.description}</DrawerDescription>
                </DrawerHeader>
                {children}
            </DrawerContent>
        </Drawer>
    )
}