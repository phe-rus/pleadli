import { dppNav } from "@/data/navigationItems"
import { JusticeScale01Icon } from "@hugeicons/core-free-icons"
import { Dashboard } from "@pleadli/ui/components/sidebar"
import { FC, PropsWithChildren } from "react"
import { Headers } from "./toolbar"

type sidebarProvider = PropsWithChildren

export const SidebarProvider: FC<sidebarProvider> = ({ children }) => {
    return (
        <Dashboard
            addOns={{
                enableNavigation: false,
            }}
            brand={{
                to: '/',
                label: 'Pleadli DPP',
                icon: JusticeScale01Icon
            }}
            itemLists={dppNav}
        >
            <div className="relative flex min-h-dvh flex-col scroll-smooth! aria-hidden">
                <Headers />
                <div className="flex flex-1 flex-col">
                    {children}
                </div>
            </div>
        </Dashboard>
    )
}
