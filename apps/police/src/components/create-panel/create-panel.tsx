import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle, DrawerTrigger } from "@pleadli/ui/components/drawer"
import { FC, PropsWithChildren, ReactNode } from "react"

type createPanelProps = PropsWithChildren<{
    trigger: ReactNode
    headings: {
        title: string
        description: string
    }
}>

export const Createpanel: FC<createPanelProps> = ({
    trigger,
    headings,
    children,
}) => {
    return (
        <Drawer swipeDirection="right">
            <DrawerTrigger
                render={<></>}
                className='p-0'
            >
                {trigger}
            </DrawerTrigger>
            <DrawerContent>
                <DrawerHeader>
                    <DrawerTitle>{headings.title}</DrawerTitle>
                    <DrawerDescription>{headings.description}</DrawerDescription>
                </DrawerHeader>
                {children}
            </DrawerContent>
        </Drawer>
    )
}