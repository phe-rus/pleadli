import { stationNav } from "@/data/navigationItems"
import { PoliceBadgeIcon, SettingsIcon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { Dashboard } from "@pleadli/ui/components/sidebar"
import { cn } from "@pleadli/ui/lib/utils"
import { Link } from "@tanstack/react-router"
import { FC, PropsWithChildren } from "react"
import { Headers } from "./toolbar"

type sidebarProvider = PropsWithChildren

export const SidebarProvider: FC<sidebarProvider> = ({ children }) => {
    return (
        <Dashboard
            addOns={{
                enableNavigation: false,
                footer: (
                    <Link
                        to='/settings'
                        className={cn(
                            'group/icon relative flex items-center gap-2 text-sm',
                            'transition-colors duration-150 ease-out py-0.5 px-1',
                            'rounded-md hover:bg-secondary w-full',
                        )}
                    >
                        <HugeiconsIcon
                            icon={SettingsIcon}
                            className='size-4'
                        />
                        Settings
                    </Link>
                )
            }}
            brand={{
                to: '/',
                label: 'Pleadli Police',
                icon: PoliceBadgeIcon
            }}
            itemLists={stationNav}
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