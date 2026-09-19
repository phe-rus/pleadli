import { StatTile } from '@/components/stat-tile'
import { useFacilities, facilitiesOptions } from '@/features/facilities'
import { todayOptions } from '@/features/obligations'
import { TodayView } from '@/features/today'
import { usePendingFacilityAlerts } from '@/hooks/use-pending-facility-alerts'
import { officerRoleLabel } from '@/features/officers'
import { useHqConfig, usePermissions } from '@/features/session'
import { ArrowRight01Icon, NetworkIcon, PauseIcon, CheckmarkCircle02Icon, Clock01Icon, ShieldKeyIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Badge } from '@pleadli/ui/badge'
import { buttonVariants } from '@pleadli/ui/button'
import { Card, CardContent } from '@pleadli/ui/card'
import { createFileRoute, Link } from '@tanstack/react-router'

export const Route = createFileRoute('/_public/')({
  loader: async ({ context }) => {
    await Promise.all([
      context.queryClient.query({ ...todayOptions(), staleTime: 'static' }).catch(() => undefined),
      context.queryClient.query({ ...facilitiesOptions(), staleTime: 'static' }).catch(() => undefined),
    ])
  },
  component: RouteComponent,
})

/** Head Office and a facility are different installations of the same
 * app, not the same screen with different data (spec: docs/specs/
 * prisons/0001-head-office-peer-sync-network/index.md: "Head Office is
 * purely an aggregator with no prisoners of its own"). Showing a
 * facility's custody stat tiles on a Head Office install would be
 * actively wrong, not just unpolished, so this branches on role rather
 * than reusing one dashboard for both. */
function RouteComponent() {
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
    <article className="container flex flex-col gap-5 pt-5 pb-20">
      <section className="flex flex-col gap-1">
        <h1>Today</h1>
        <p className="md:max-w-lg">This account can administer the facility but cannot open prisoner records.</p>
      </section>
      <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border py-16 text-center text-muted-foreground">
        <HugeiconsIcon icon={ShieldKeyIcon} size={20} />
        <p className="max-w-sm text-sm">
          The {officerRoleLabel(role).toLowerCase()} role manages accounts, workstations and the node. Sign in with an Officer in charge,
          Officer or Records account to work with records.
        </p>
        <Link to="/officers" className={buttonVariants({ variant: 'outline', size: 'sm' })}>
          Manage accounts
        </Link>
      </div>
    </article>
  )
}

/**
 * Head Office oversees the national estate, not individual prisoners: it
 * has none of its own. This is deliberately a different shape from the
 * Facility Overview below (facility counts, not prisoner counts). The
 * full roster with per-facility detail lives at its own `/facilities`
 * page now, not embedded here — Overview stays a glance-only dashboard,
 * matching the same page-for-management/dashboard-for-glance split every
 * other domain in this app already follows.
 */
function HqOverview() {
  const { data: facilities } = useFacilities()
  usePendingFacilityAlerts()
  const all = facilities ?? []
  const pending = all.filter((f) => f.status === 'pending_verification')
  const active = all.filter((f) => f.status === 'active')
  const revoked = all.filter((f) => f.status === 'revoked')

  return (
    <article className="container flex flex-col gap-6 pt-6 pb-20">
      <section className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex size-9 items-center justify-center rounded-full bg-primary/10 text-primary">
            <HugeiconsIcon icon={NetworkIcon} size={18} />
          </div>
          <div className="flex flex-col gap-0.5">
            <h1>Head Office Overview</h1>
            <p className="md:max-w-sm">Every paired facility, at a glance.</p>
          </div>
        </div>
        <Link to="/facilities" className={buttonVariants({ size: 'sm', variant: 'secondary' })}>
          View Facilities
          <HugeiconsIcon icon={ArrowRight01Icon} />
        </Link>
      </section>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          label="Registered Facilities"
          icon={NetworkIcon}
          tint="primary"
          value={all.length}
          caption="Paired with this Head Office"
        />
        <StatTile
          label="Pending Verification"
          icon={Clock01Icon}
          tint={pending.length > 0 ? 'amber' : 'emerald'}
          value={pending.length}
          meta={pending.length > 0 && <Badge variant="destructive">Needs review</Badge>}
          caption="Waiting on an emailed verification code"
        />
        <StatTile label="Active" icon={CheckmarkCircle02Icon} tint="emerald" value={active.length} caption="Pushing their prisoner roster" />
        <StatTile
          label="Revoked"
          icon={PauseIcon}
          tint={revoked.length > 0 ? 'rose' : 'emerald'}
          value={revoked.length}
          caption="No longer able to sync"
        />
      </section>

      {all.length === 0 && (
        <Card className="border-dashed p-0">
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <div className="flex size-11 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <HugeiconsIcon icon={NetworkIcon} size={20} />
            </div>
            <div className="flex flex-col gap-1">
              <h3 className="text-sm font-medium">No facilities paired yet</h3>
              <p className="max-w-sm text-xs text-muted-foreground">
                Generating a pairing code for a new facility, and reviewing its email verification, are the next slice
                of this build, not available yet.
              </p>
            </div>
          </CardContent>
        </Card>
      )}
    </article>
  )
}
