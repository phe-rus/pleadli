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
}>

export const Createpanel: FC<createPanelProps> = ({
    trigger,
    headings,
    open,
    onOpenChange,
    children,
}) => {
    return (
        <Drawer open={open} onOpenChange={onOpenChange} swipeDirection="right">
            {trigger && <DrawerTrigger render={trigger} />}
            <DrawerContent className='bg-background!'>
                <DrawerHeader className='gap-0!'>
                    <DrawerTitle>{headings.title}</DrawerTitle>
                    <DrawerDescription className='md:max-w-sm'>{headings.description}</DrawerDescription>
                </DrawerHeader>
                {children}
            </DrawerContent>
        </Drawer>
    )
}