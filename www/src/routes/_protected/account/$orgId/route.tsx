import { CloudShell } from '@/components/cloud-shell'
import { getInstitution } from '@/functions/account.func'
import * as m from '@/paraglide/messages'
import { Building03Icon, ComputerIcon, DashboardBrowsingIcon, DatabaseIcon, HelpCircleIcon, Key01Icon, UserGroupIcon } from '@hugeicons/core-free-icons'
import { cn } from '@pleadli/ui/lib/utils'
import { createFileRoute, Outlet } from '@tanstack/react-router'

export const Route = createFileRoute('/_protected/account/$orgId')({
  loader: ({ params }) => getInstitution({ data: { organizationId: params.orgId } }),
  component: RouteComponent,
})

/** Pleadli Account: one institution's own area. Its address, offices,
 * licences, computers, backups, team and help, in the visitor's language. */
function RouteComponent() {
  const { institution } = Route.useLoaderData()
  const base = `/account/${institution.id}`
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
    <CloudShell
      brand={{ to: '/account', label: institution.name, icon: Building03Icon }}
      nav={nav}
      identity={(
        <span className={cn(
          'inline-flex max-w-full truncate rounded-full bg-foreground/[0.06] px-2.5',
          'py-0.5 font-mono text-[0.7rem] text-muted-foreground',
        )}>
          {institution.address ?? m["orch.status.pending_title"]()}
        </span>
      )}
      websiteLabel={m["orch.website"]()}
      signOutLabel={m["orch.sign_out"]()}
    >
      <Outlet />
    </CloudShell>
  )
}
