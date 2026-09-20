import { Createpanel } from '@/components/create-panel'
import { FacilityProfileForm } from '@/features/facility'
import { ObligationQueue, useToday } from '@/features/obligations'
import { isObligationAlertsEnabled, setObligationAlertsEnabled, useObligationAlerts } from '@/hooks/use-obligation-alerts'
import { ArrowRight01Icon, Settings02Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Badge } from '@pleadli/ui/badge'
import { Button, buttonVariants } from '@pleadli/ui/button'
import { Card, CardContent } from '@pleadli/ui/card'
import { Switch } from '@pleadli/ui/switch'
import { Link } from '@tanstack/react-router'
import { useState } from 'react'

/**
 * The facility's working home (docs/prisons/product-map/08 1.3): who is held
 * now, what is owed, what is in flight. It answers "what needs doing", not
 * "how are we trending"; analytics live under Returns. Read as a document —
 * page grammar — not a wall of stat tiles.
 */
export function TodayView() {
  const { data: today } = useToday()
  const [alerts, setAlerts] = useState(isObligationAlertsEnabled)
  const [profileOpen, setProfileOpen] = useState(false)
  const [profileDirty, setProfileDirty] = useState(false)
  useObligationAlerts()

  const { population: pop, movements, facility } = today
  const due = today.obligations.filter((o) => o.group === 'due')
  const exceptions = today.obligations.filter((o) => o.group === 'exception')
  const occupancy = pop.capacity ? Math.round((pop.held / pop.capacity) * 100) : null
  const profileMissing = !facility.name

  return (
    <article className="page">
      <header className="page-header">
        <div>
          <h1>{facility.name ?? 'Today'}</h1>
          <p>What is held, what is owed, and what is in flight.</p>
        </div>
        <div className="page-actions">
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            Desktop alerts
            <Switch
              checked={alerts}
              onCheckedChange={(checked) => {
                setObligationAlertsEnabled(checked)
                setAlerts(checked)
              }}
            />
          </label>
          <Link to="/procedures/reception" className={buttonVariants({ size: 'sm' })}>
            Receive someone
          </Link>
        </div>
      </header>

      {profileMissing && (
        <Card className="border-dashed p-0">
          <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
            <div className="flex items-start gap-3">
              <HugeiconsIcon icon={Settings02Icon} size={18} className="mt-0.5 text-muted-foreground" />
              <div className="flex flex-col gap-0.5">
                <span className="text-sm font-medium">Set the facility profile</span>
                <span className="text-xs text-muted-foreground">
                  The name goes on a transfer dossier, and approved capacity is what occupancy is measured against.
                </span>
              </div>
            </div>
            <Button size="sm" variant="secondary" onClick={() => setProfileOpen(true)}>
              Set up
            </Button>
          </CardContent>
        </Card>
      )}

      <section className="page-section">
        <div className="section-head">
          <h2>Who is held</h2>
          <span className="text-xs text-muted-foreground">
            {pop.capacity ? (
              <>
                Approved capacity {pop.capacity}. Occupancy <strong className="text-foreground">{occupancy}%</strong>.
              </>
            ) : (
              <>Approved capacity not set. {profileMissing ? '' : 'Set it in the facility profile.'}</>
            )}
          </span>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Card className="p-0 lg:col-span-2">
            <CardContent className="flex flex-col gap-2 py-4">
              <span className="text-xs tracking-wide text-muted-foreground uppercase">Held now</span>
              <div className="flex items-end gap-3">
                <span className="text-4xl leading-none font-semibold tabular-nums">{pop.held}</span>
                <span className="pb-1 text-sm text-muted-foreground">
                  Convicted {pop.convicted} · Remand {pop.unconvicted} · Civil {pop.civil}
                </span>
              </div>
            </CardContent>
          </Card>
          <Card className="p-0">
            <CardContent className="flex flex-col gap-2 py-4">
              <span className="text-xs tracking-wide text-muted-foreground uppercase">Away from the cells</span>
              <span className="text-sm">
                <strong className="tabular-nums">{pop.hospitalised}</strong> at hospital
              </span>
              <span className="text-sm">
                <strong className="tabular-nums">{movements.courtToday}</strong> court today
              </span>
              <span className="text-sm">
                <strong className="tabular-nums">{pop.inTransit}</strong> in transit
              </span>
            </CardContent>
          </Card>
          <Card className="p-0">
            <CardContent className="flex flex-col gap-2 py-4">
              <span className="text-xs tracking-wide text-muted-foreground uppercase">Movements</span>
              <span className="text-sm">
                <strong className="tabular-nums">{movements.awaitingConfirmation}</strong> arrived, awaiting confirmation
              </span>
              <span className="text-sm">
                <strong className="tabular-nums">{movements.inTransit}</strong> dispatched, not confirmed
              </span>
              <Link to="/movements" className="flex items-center gap-1 text-xs text-primary underline-offset-2 hover:underline">
                Open movements
                <HugeiconsIcon icon={ArrowRight01Icon} size={12} />
              </Link>
            </CardContent>
          </Card>
        </div>
      </section>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <section className="page-section">
          <div className="section-head">
            <h2>Due now</h2>
          </div>
          <ObligationQueue obligations={due} now={today.now} emptyMessage="Nothing is due. The queue is clear." />
        </section>
        <section className="page-section">
          <div className="section-head">
            <div className="flex items-center gap-2">
              <h2>Exceptions</h2>
              {exceptions.length > 0 && <Badge variant="destructive">{exceptions.length}</Badge>}
            </div>
          </div>
          <ObligationQueue obligations={exceptions} now={today.now} flat emptyMessage="No exceptions. Documents, sentences and transfers are in order." />
        </section>
      </div>

      <Createpanel
        open={profileOpen}
        onOpenChange={setProfileOpen}
        isDirty={profileDirty}
        headings={{ title: 'Facility profile', description: 'This facility’s name and approved capacity.' }}
      >
        <FacilityProfileForm profile={facility} onSuccess={() => setProfileOpen(false)} onDirtyChange={setProfileDirty} />
      </Createpanel>
    </article>
  )
}
