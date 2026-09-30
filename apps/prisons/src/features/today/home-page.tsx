import { EstateHome } from '@/features/estate'
import { TodayView } from './today-view'
import { officerRoleLabel } from '@/features/officers'
import { useHqConfig, usePermissions } from '@/features/session'
import { ShieldKeyIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { buttonVariants } from '@pleadli/ui/button'
import { Link } from '@tanstack/react-router'
import { inlineLabel } from '@/features/i18n'
import { m } from '@/paraglide/messages'

/** Head Office and a facility are different installations of the same app,
 * not the same screen with different data (spec: docs/specs/prisons/
 * 0001-head-office-peer-sync-network/index.md: "Head Office is purely an
 * aggregator with no prisoners of its own"). A facility opens on Today, the
 * place its own work is run from; Head Office opens on Estate, the place the
 * network is watched from. Showing a facility's custody on a Head Office
 * install would be actively wrong, so this branches on role. */
export function HomePage() {
  const { data: hqConfig, isLoading } = useHqConfig()
  const { can, session, isPending } = usePermissions()
  if (isLoading) return null
  if (hqConfig?.isHeadOffice) return <EstateHome />
  if (isPending) return null
  if (session && !can('prisoner.read')) return <NoRecordAccess role={session.officer.role} />
  return <TodayView />
}

/** An administrator role holds no record access by design (administering
 * accounts never implies reading prisoner records), so the facility's daily
 * view has nothing it may show. */
function NoRecordAccess({ role }: { role: string }) {
  return (
    <article className="page">
      <header className="page-header">
        <div>
          <h1>{m.route_index_today()}</h1>
          <p className="md:max-w-lg">{m.route_index_this_account_can_administer_the_facility()}</p>
        </div>
      </header>
      <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border py-16 text-center text-muted-foreground">
        <HugeiconsIcon icon={ShieldKeyIcon} size={20} />
        <p className="max-w-sm text-sm">
          {m.route_index_the_role_manages_accounts_workstations_a({ role: inlineLabel(officerRoleLabel(role)) })}</p>
        <Link to="/officers" className={buttonVariants({ variant: 'outline', size: 'sm' })}>
          {m.route_index_manage_accounts()}
        </Link>
      </div>
    </article>
  )
}
