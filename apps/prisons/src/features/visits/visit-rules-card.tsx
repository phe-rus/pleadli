import { ApiError } from '@/lib/api'
import { usePermissions } from '@/features/session'
import { Settings02Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Button } from '@pleadli/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@pleadli/ui/dialog'
import { Field, FieldDescription, FieldLabel } from '@pleadli/ui/field'
import { t } from '@pleadli/ui/goey-toaster'
import { Input } from '@pleadli/ui/input'
import { cn } from '@pleadli/ui/lib/utils'
import { useState } from 'react'
import { useSaveVisitRules, useVisitRules } from './queries'
import { minutesToTime, timeToMinutes, weekdays, type VisitRules } from './schema'
import { m } from '@/paraglide/messages'

function summary(rules: VisitRules) {
  const days = weekdays.filter((d) => rules.visitingDays.includes(d.value)).map((d) => d.label)
  const run = days.length > 1 ? `${days[0]} to ${days[days.length - 1]}` : days[0]
  const contiguous = rules.visitingDays.length === days.length && rules.visitingDays.every((d, i, all) => i === 0 || d === all[i - 1] + 1)
  return `${contiguous ? run : days.join(', ')}, ${minutesToTime(rules.opensMinutes)} to ${minutesToTime(rules.closesMinutes)}`
}

/** The facility's visiting rules in one line, editable by an Officer in
 * Charge. Their sources are secondary or unconfirmed, so every value is a
 * setting rather than a built-in rule. */
export function VisitRulesCard() {
  const { data: rules } = useVisitRules()
  const { can } = usePermissions()
  const [open, setOpen] = useState(false)

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border border-border/60 px-3 py-2 text-xs">
      <span className="font-medium">{m.visits_visiting_rules()}</span>
      <span className="text-muted-foreground">{summary(rules)}</span>
      <span className="text-muted-foreground">{m.visits_up_to_visitors_at_a_time({ maxVisitorsPerVisit: rules.maxVisitorsPerVisit, maxVisitorsPerPrisonerPerDay: rules.maxVisitorsPerPrisonerPerDay })}</span>
      <span className="text-muted-foreground">{m.visits_min_each({ defaultDurationMinutes: rules.defaultDurationMinutes })}</span>
      {can('authorise.exception') && (
        <Button size="xs" variant="ghost" className="ml-auto" onClick={() => setOpen(true)}>
          <HugeiconsIcon icon={Settings02Icon} size={12} /> {m.visits_edit()}
        </Button>
      )}
      {open && <RulesDialog rules={rules} onClose={() => setOpen(false)} />}
    </div>
  )
}

function RulesDialog({ rules, onClose }: { rules: VisitRules; onClose: () => void }) {
  const save = useSaveVisitRules()
  const [perVisit, setPerVisit] = useState(String(rules.maxVisitorsPerVisit))
  const [perDay, setPerDay] = useState(String(rules.maxVisitorsPerPrisonerPerDay))
  const [days, setDays] = useState<number[]>(rules.visitingDays)
  const [opens, setOpens] = useState(minutesToTime(rules.opensMinutes))
  const [closes, setCloses] = useState(minutesToTime(rules.closesMinutes))
  const [duration, setDuration] = useState(String(rules.defaultDurationMinutes))

  const submit = () =>
    save.mutate(
      {
        maxVisitorsPerVisit: Number(perVisit),
        maxVisitorsPerPrisonerPerDay: Number(perDay),
        visitingDays: days,
        opensMinutes: timeToMinutes(opens),
        closesMinutes: timeToMinutes(closes),
        defaultDurationMinutes: Number(duration),
      },
      {
        onSuccess: () => {
          t.success(m.visits_visiting_rules_saved())
          onClose()
        },
        onError: (error) => t.error(m.visits_could_not_save_the_rules(), { description: error instanceof ApiError ? error.message : m.visits_please_try_again() }),
      },
    )

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{m.visits_visiting_rules()}</DialogTitle>
          <DialogDescription>
            {m.visits_defaults_follow_the_published_visiting_h()}
          </DialogDescription>
        </DialogHeader>

        <Field>
          <FieldLabel>{m.visits_visiting_days()}</FieldLabel>
          <div className="flex flex-wrap gap-1.5">
            {weekdays.map((day) => {
              const on = days.includes(day.value)
              return (
                <button
                  key={day.value}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setDays((prev) => (on ? prev.filter((d) => d !== day.value) : [...prev, day.value].sort()))}
                  className={cn('rounded-md border px-2.5 py-1 text-xs', on ? 'border-primary bg-primary/10' : 'border-border text-muted-foreground')}
                >
                  {day.label}
                </button>
              )
            })}
          </div>
          <FieldDescription>{m.visits_anything_outside_these_days_and_hours()}</FieldDescription>
        </Field>

        <div className="flex flex-wrap gap-3 *:min-w-32 *:flex-1">
          <Field>
            <FieldLabel>{m.visits_opens()}</FieldLabel>
            <Input type="time" value={opens} onChange={(event) => setOpens(event.target.value)} />
          </Field>
          <Field>
            <FieldLabel>{m.visits_closes()}</FieldLabel>
            <Input type="time" value={closes} onChange={(event) => setCloses(event.target.value)} />
          </Field>
        </div>

        <div className="flex flex-wrap gap-3 *:min-w-32 *:flex-1">
          <Field>
            <FieldLabel>{m.visits_visitors_at_a_time()}</FieldLabel>
            <Input type="number" min={1} autoComplete="off" value={perVisit} onChange={(event) => setPerVisit(event.target.value)} />
          </Field>
          <Field>
            <FieldLabel>{m.visits_visitors_a_day_per_prisoner()}</FieldLabel>
            <Input type="number" min={1} autoComplete="off" value={perDay} onChange={(event) => setPerDay(event.target.value)} />
          </Field>
          <Field>
            <FieldLabel>{m.visits_minutes_per_visit()}</FieldLabel>
            <Input type="number" min={5} max={240} autoComplete="off" value={duration} onChange={(event) => setDuration(event.target.value)} />
          </Field>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            {m.visits_cancel()}
          </Button>
          <Button disabled={save.isPending} onClick={submit}>
            {m.visits_save_rules()}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
