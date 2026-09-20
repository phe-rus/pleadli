import { Createpanel } from '@/components/create-panel'
import { FacilityProfileForm } from '@/features/facility'
import { ObligationQueue, useToday } from '@/features/obligations'
import { StatisticsBoard } from '@/features/reports'
import { usePermissions } from '@/features/session'
import { isObligationAlertsEnabled, setObligationAlertsEnabled, useObligationAlerts } from '@/hooks/use-obligation-alerts'
import { ArrowRight01Icon, Settings02Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Badge } from '@pleadli/ui/badge'
import { Button, buttonVariants } from '@pleadli/ui/button'
import { Card, CardContent } from '@pleadli/ui/card'
import { Switch } from '@pleadli/ui/switch'
import { Link } from '@tanstack/react-router'
import { useState } from 'react'
import { m } from '@/paraglide/messages'

/**
 * The facility's working home (docs/prisons/product-map/08 1.3): who is held
 * now, what is owed, what is in flight. What needs doing comes first; how the
 * prison is trending follows as statistics at the foot, for whoever may read
 * reports. The numbered, printable returns are in Reports. Read as a document —
 * page grammar — not a wall of stat tiles.
 */
export function TodayView() {
  const { data: today } = useToday()
  const [alerts, setAlerts] = useState(isObligationAlertsEnabled)
  const [profileOpen, setProfileOpen] = useState(false)
  const [profileDirty, setProfileDirty] = useState(false)
  useObligationAlerts()
  const { can } = usePermissions()

  const { population: pop, movements, facility } = today
  const due = today.obligations.filter((o) => o.group === 'due')
  const exceptions = today.obligations.filter((o) => o.group === 'exception')
  const occupancy = pop.capacity ? Math.round((pop.held / pop.capacity) * 100) : null
  const profileMissing = !facility.name

  return (
    <article className="page">
      <header className="page-header">
        <div>
          <h1>{facility.name ?? m.today_today()}</h1>
          <p>{m.today_what_is_held_what_is_owed()}</p>
        </div>
        <div className="page-actions">
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            {m.today_desktop_alerts()}
            <Switch
              checked={alerts}
              onCheckedChange={(checked) => {
                setObligationAlertsEnabled(checked)
                setAlerts(checked)
              }}
            />
          </label>
          <Link to="/procedures/reception" className={buttonVariants({ size: 'sm' })}>
            {m.today_receive_someone()}
          </Link>
        </div>
      </header>

      {profileMissing && (
        <Card className="border-dashed p-0">
          <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
            <div className="flex items-start gap-3">
              <HugeiconsIcon icon={Settings02Icon} size={18} className="mt-0.5 text-muted-foreground" />
              <div className="flex flex-col gap-0.5">
                <span className="text-sm font-medium">{m.today_set_the_facility_profile()}</span>
                <span className="text-xs text-muted-foreground">
                  {m.today_the_name_goes_on_a_transfer()}
                </span>
              </div>
            </div>
            <Button size="sm" variant="secondary" onClick={() => setProfileOpen(true)}>
              {m.today_set_up()}
            </Button>
          </CardContent>
        </Card>
      )}

      <section className="page-section">
        <div className="section-head">
          <h2>{m.today_who_is_held()}</h2>
          <span className="text-xs text-muted-foreground">
            {pop.capacity ? (
              <>
                {m.today_approved_capacity_occupancy({ capacity: pop.capacity })}{' '}<strong className="text-foreground">{occupancy}%</strong>.
              </>
            ) : (
              <>{m.today_approved_capacity_not_set()} {profileMissing ? '' : m.today_set_it_in_the_facility_profile()}</>
            )}
          </span>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Card className="p-0 lg:col-span-2">
            <CardContent className="flex flex-col gap-2 py-4">
              <span className="text-xs tracking-wide text-muted-foreground uppercase">{m.today_held_now()}</span>
              <div className="flex items-end gap-3">
                <span className="text-4xl leading-none font-semibold tabular-nums">{pop.held}</span>
                <span className="pb-1 text-sm text-muted-foreground">
                  {m.today_convicted_remand_civil({ convicted: pop.convicted, unconvicted: pop.unconvicted, civil: pop.civil })}</span>
              </div>
            </CardContent>
          </Card>
          <Card className="p-0">
            <CardContent className="flex flex-col gap-2 py-4">
              <span className="text-xs tracking-wide text-muted-foreground uppercase">{m.today_away_from_the_cells()}</span>
              <span className="text-sm">
                <strong className="tabular-nums">{pop.hospitalised}</strong> {m.today_at_hospital()}
              </span>
              <span className="text-sm">
                <strong className="tabular-nums">{movements.courtToday}</strong> {m.today_court_today()}
              </span>
              <span className="text-sm">
                <strong className="tabular-nums">{pop.inTransit}</strong> {m.today_in_transit()}
              </span>
            </CardContent>
          </Card>
          <Card className="p-0">
            <CardContent className="flex flex-col gap-2 py-4">
              <span className="text-xs tracking-wide text-muted-foreground uppercase">{m.today_movements()}</span>
              <span className="text-sm">
                <strong className="tabular-nums">{movements.awaitingConfirmation}</strong> {m.today_arrived_awaiting_confirmation()}
              </span>
              <span className="text-sm">
                <strong className="tabular-nums">{movements.inTransit}</strong> {m.today_dispatched_not_confirmed()}
              </span>
              <Link to="/movements" className="flex items-center gap-1 text-xs text-primary underline-offset-2 hover:underline">
                {m.today_open_movements()}
                <HugeiconsIcon icon={ArrowRight01Icon} size={12} />
              </Link>
            </CardContent>
          </Card>
        </div>
      </section>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <section className="page-section">
          <div className="section-head">
            <h2>{m.today_due_now()}</h2>
          </div>
          <ObligationQueue obligations={due} now={today.now} emptyMessage={m.today_nothing_is_due_the_queue_is()} />
        </section>
        <section className="page-section">
          <div className="section-head">
            <div className="flex items-center gap-2">
              <h2>{m.today_exceptions()}</h2>
              {exceptions.length > 0 && <Badge variant="destructive">{exceptions.length}</Badge>}
            </div>
          </div>
          <ObligationQueue obligations={exceptions} now={today.now} flat emptyMessage={m.today_no_exceptions_documents_sentences_and_tr()} />
        </section>
      </div>

      {can('report.read') && (
        <section className="page-section">
          <div className="section-head">
            <div className="flex flex-col gap-0.5">
              <h2>{m.statistics_heading()}</h2>
              <p>{m.statistics_facility_about()}</p>
            </div>
            <Link to="/reports" className={buttonVariants({ size: 'sm', variant: 'secondary' })}>
              {m.statistics_printable_returns()}
              <HugeiconsIcon icon={ArrowRight01Icon} />
            </Link>
          </div>
          <StatisticsBoard scope="facility" />
        </section>
      )}

      <Createpanel
        open={profileOpen}
        onOpenChange={setProfileOpen}
        isDirty={profileDirty}
        headings={{ title: m.today_facility_profile(), description: m.today_this_facility_s_name_and_approved() }}
      >
        <FacilityProfileForm profile={facility} onSuccess={() => setProfileOpen(false)} onDirtyChange={setProfileDirty} />
      </Createpanel>
    </article>
  )
}
