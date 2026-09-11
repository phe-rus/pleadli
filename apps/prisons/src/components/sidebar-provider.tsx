import { prisonsNav } from "@/data/navigationItems"
import { PrisonIcon } from "@hugeicons/core-free-icons"
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
                label: 'Pleadli Prisons',
                icon: PrisonIcon
            }}
            itemLists={prisonsNav}
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
