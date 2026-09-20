import { EstateBoard } from '@/features/estate'
import { StatisticsBoard } from '@/features/reports'
import { TodayView } from './today-view'
import { usePendingFacilityAlerts } from '@/hooks/use-pending-facility-alerts'
import { officerRoleLabel } from '@/features/officers'
import { useHqConfig, usePermissions } from '@/features/session'
import { ArrowRight01Icon, NetworkIcon, ShieldKeyIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { buttonVariants } from '@pleadli/ui/button'
import { Link } from '@tanstack/react-router'
import { m } from '@/paraglide/messages'

/** Head Office and a facility are different installations of the same
 * app, not the same screen with different data (spec: docs/specs/
 * prisons/0001-head-office-peer-sync-network/index.md: "Head Office is
 * purely an aggregator with no prisoners of its own"). Showing a
 * facility's custody stat tiles on a Head Office install would be
 * actively wrong, not just unpolished, so this branches on role rather
 * than reusing one dashboard for both. */
export function HomePage() {
  const { data: hqConfig, isLoading } = useHqConfig()
  const { can, session, isPending } = usePermissions()
  if (isLoading) return null
  if (hqConfig?.isHeadOffice) return <HqOverview />
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
          {m.route_index_the_role_manages_accounts_workstations_a({ role: officerRoleLabel(role).toLowerCase() })}</p>
        <Link to="/officers" className={buttonVariants({ variant: 'outline', size: 'sm' })}>
          {m.route_index_manage_accounts()}
        </Link>
      </div>
    </article>
  )
}

/**
 * Head Office oversees the national estate, not individual prisoners: it has
 * none of its own. Home is estate health (which facilities need attention,
 * then each region and its facilities), not a count of pairings. Pairing and
 * the roster live under Facilities.
 */
function HqOverview() {
  const { can } = usePermissions()
  usePendingFacilityAlerts()

  return (
    <article className="page">
      <header className="page-header">
        <div className="flex items-center gap-3">
          <div className="flex size-9 items-center justify-center rounded-full bg-primary/10 text-primary">
            <HugeiconsIcon icon={NetworkIcon} size={18} />
          </div>
          <div className="flex flex-col gap-0.5">
            <h1>{m.route_index_head_office_overview()}</h1>
            <p className="md:max-w-sm">{m.estate_page_about()}</p>
          </div>
        </div>
        <div className="page-actions">
          <Link to="/facilities" className={buttonVariants({ size: 'sm', variant: 'secondary' })}>
            {m.route_index_view_facilities()}
            <HugeiconsIcon icon={ArrowRight01Icon} />
          </Link>
        </div>
      </header>

      <EstateBoard />

      {can('hq.reports') && (
        <section className="page-section">
          <div className="section-head">
            <div className="flex flex-col gap-0.5">
              <h2>{m.statistics_heading()}</h2>
              <p>{m.statistics_head_office_about()}</p>
            </div>
            <Link to="/reports" className={buttonVariants({ size: 'sm', variant: 'secondary' })}>
              {m.statistics_printable_returns()}
              <HugeiconsIcon icon={ArrowRight01Icon} />
            </Link>
          </div>
          <StatisticsBoard scope="head_office" />
        </section>
      )}
    </article>
  )
}
