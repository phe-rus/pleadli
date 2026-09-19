import { prisonsNav, type SidebarNavItem } from "@/data/navigationItems"
import { useHqConfig, useSession } from "@/features/session"
import { PrisonIcon } from "@hugeicons/core-free-icons"
import { Dashboard } from "@pleadli/ui/components/sidebar"
import { FC, PropsWithChildren, useMemo } from "react"
import { SidebarUserFooter } from "./sidebar-user-footer"
import { Headers } from "./toolbar"

type sidebarProvider = PropsWithChildren

export const SidebarProvider: FC<sidebarProvider> = ({ children }) => {
    const { data: hqConfig } = useHqConfig()
    const isHeadOffice = hqConfig?.isHeadOffice ?? false
    // Head Office has no prisoners of its own, so every prisoner-scoped
    // route (`facilityOnly`) has nothing to show it there; a facility, in
    // turn, has no other facility to manage, so every Head Office
    // management route (`hqOnly`) has nothing to show it there either
    // (spec: docs/specs/prisons/0001-head-office-peer-sync-network/
    // index.md).
    const permissions = useSession().data?.permissions
    // An account holding only administration permissions (a facility
    // administrator) would otherwise see areas whose every call the node
    // refuses. Until the session has loaded nothing is hidden.
    const itemLists = useMemo(() => {
        const allowed = (item: SidebarNavItem) => !permissions || !item.requires || item.requires.some((p) => permissions.includes(p))
        return prisonsNav
            .filter((item) => (isHeadOffice ? !item.facilityOnly : !item.hqOnly))
            .map((item) => (item.children ? { ...item, children: item.children.filter(allowed) } : item))
            .filter((item) => allowed(item) && (!item.children || item.children.length > 0))
    }, [isHeadOffice, permissions])

    return (
        <Dashboard
            addOns={{
                enableNavigation: false,
                footer: <SidebarUserFooter />,
            }}
            brand={{
                to: '/',
                label: 'Pleadli Prisons',
                icon: PrisonIcon
            }}
            itemLists={itemLists}
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
