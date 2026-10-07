import { authClient } from '@/auth/client'
import { getInstitution } from '@/functions/orchestra.func'
import * as m from '@/paraglide/messages'
import { Building03Icon, ComputerIcon, DashboardBrowsingIcon, DatabaseIcon, HelpCircleIcon, Key01Icon, UserGroupIcon } from '@hugeicons/core-free-icons'
import { Dashboard } from '@pleadli/ui/sidebar'
import { createFileRoute, Link, Outlet } from '@tanstack/react-router'

export const Route = createFileRoute('/_protected/orchestra/$orgId')({
  loader: ({ params }) => getInstitution({ data: { organizationId: params.orgId } }),
  component: RouteComponent,
})

/** An institution's own Orchestra: its address, offices, licences, computers,
 * backups, team and help, in the visitor's language. */
function RouteComponent() {
  const { institution } = Route.useLoaderData()
  const base = `/orchestra/${institution.id}`
  const nav = [
    { icon: DashboardBrowsingIcon, label: m["orch.nav.overview"](), to: base, exact: true },
    { icon: Building03Icon, label: m["orch.nav.offices"](), to: `${base}/offices` },
    { icon: Key01Icon, label: m["orch.nav.licences"](), to: `${base}/licences` },
    { icon: ComputerIcon, label: m["orch.nav.computers"](), to: `${base}/computers` },
    { icon: DatabaseIcon, label: m["orch.nav.backups"](), to: `${base}/backups` },
    { icon: UserGroupIcon, label: m["orch.nav.team"](), to: `${base}/team` },
    { icon: HelpCircleIcon, label: m["orch.nav.help"](), to: `${base}/help` },
  ]
  return (
    <Dashboard
      brand={{ to: '/orchestra', label: institution.name, icon: Building03Icon }}
      itemLists={nav}
      addOns={{
        enableNavigation: true,
        identity: (
          <span className="inline-flex max-w-full truncate rounded-full bg-foreground/[0.06] px-2.5 py-0.5 font-mono text-[0.7rem] text-muted-foreground">
            {institution.address ?? m["orch.status.pending_title"]()}
          </span>
        ),
        footer: (
          <div className="flex flex-col gap-0.5 border-t border-border/60 pt-3">
            <Link to="/" className="rounded-lg px-2 py-1.5 text-[0.8125rem] text-muted-foreground hover:bg-foreground/[0.05] hover:text-foreground">
              {m["orch.website"]()}
            </Link>
            <button
              type="button"
              className="cursor-pointer rounded-lg px-2 py-1.5 text-start text-[0.8125rem] text-muted-foreground hover:bg-foreground/[0.05] hover:text-foreground"
              onClick={() => authClient.signOut({ fetchOptions: { onSuccess: () => { window.location.href = '/' } } })}
            >
              {m["orch.sign_out"]()}
            </button>
          </div>
        ),
      }}
    >
      <Outlet />
    </Dashboard>
  )
}
