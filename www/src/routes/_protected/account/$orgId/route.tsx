import { CloudShell, type ShellGroup } from '@/components/cloud-shell'
import { getInstitution } from '@/functions/account.func'
import * as m from '@/paraglide/messages'
import { Building03Icon, ComputerIcon, DashboardBrowsingIcon, DatabaseIcon, HelpCircleIcon, Key01Icon, Mailbox01Icon, UserGroupIcon } from '@hugeicons/core-free-icons'
import { cn } from '@pleadli/ui/lib/utils'
import { createFileRoute, Outlet } from '@tanstack/react-router'

export const Route = createFileRoute('/_protected/account/$orgId')({
  loader: ({ params }) => getInstitution({ data: { organizationId: params.orgId } }),
  component: RouteComponent,
})

/** Pleadli Account: one institution's own area. Its address, offices,
 * licences, computers, backups, team and help, in the visitor's language. */
function RouteComponent() {
  const { institution, computers, members, pendingConnections, viewer, institutions } = Route.useLoaderData()
  const quiet = computers.filter((c) => Date.now() - new Date(c.lastSeenAt).getTime() > 7 * 86_400_000).length
  const invited = members.filter((p) => p.status === 'invited').length
  const base = `/account/${institution.id}`
  const groups: ShellGroup[] = [
    { id: 'home', items: [{ icon: DashboardBrowsingIcon, label: m["orch.nav.overview"](), to: base, exact: true }] },
    {
      id: 'apps',
      title: m["orch.nav.group_apps"](),
      items: [
        { icon: Key01Icon, label: m["orch.nav.licences"](), to: `${base}/licences` },
        { icon: ComputerIcon, label: m["orch.nav.computers"](), to: `${base}/computers`, count: quiet },
        { icon: DatabaseIcon, label: m["orch.nav.backups"](), to: `${base}/backups` },
      ],
    },
    {
      id: 'people',
      title: m["orch.nav.group_people"](),
      items: [
        { icon: Mailbox01Icon, label: m["orch.nav.postbox"](), to: `${base}/postbox`, count: pendingConnections, urgent: pendingConnections > 0 },
        { icon: Building03Icon, label: m["orch.nav.offices"](), to: `${base}/offices` },
        { icon: UserGroupIcon, label: m["orch.nav.team"](), to: `${base}/team`, count: invited },
      ],
    },
    { id: 'help', items: [{ icon: HelpCircleIcon, label: m["orch.nav.help"](), to: `${base}/help` }] },
  ]
  return (
    <CloudShell
      brand={{ to: '/account', label: institution.name, icon: Building03Icon }}
      groups={groups}
      identity={(
        <span className={cn(
          'inline-flex max-w-full truncate rounded-full bg-foreground/[0.06] px-2.5',
          'py-0.5 font-mono text-[0.7rem] text-muted-foreground',
        )}>
          {institution.address ?? m["orch.status.pending_title"]()}
        </span>
      )}
      signedInAs={viewer.email}
      links={[
        ...(institutions.length > 1 ? [{ to: '/account', label: m["orch.switch_institution"]() }] : []),
        ...(viewer.staff ? [{ to: '/admin', label: m["orch.go_admin"]() }] : []),
        { to: '/', label: m["orch.website"]() },
      ]}
      signOutLabel={m["orch.sign_out"]()}
      openMenuLabel={m["orch.nav.menu"]()}
      closeMenuLabel={m["orch.nav.close"]()}
    >
      <Outlet />
    </CloudShell>
  )
}
