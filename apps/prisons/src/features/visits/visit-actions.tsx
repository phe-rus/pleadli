import { ApiError } from '@/lib/api'
import { CheckmarkCircle02Icon, Login01Icon, PlayIcon, UserBlock01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Button } from '@pleadli/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@pleadli/ui/dialog'
import { Field, FieldDescription, FieldLabel } from '@pleadli/ui/field'
import { t } from '@pleadli/ui/goey-toaster'
import { Input } from '@pleadli/ui/input'
import { Switch } from '@pleadli/ui/switch'
import { useState } from 'react'
import type { VisitAction } from './data'
import { useVisitAction } from './queries'
import { itemDispositions, type Visit } from './schema'
import { m } from '@/paraglide/messages'

type Dialogs = null | 'check-in' | 'deny' | 'cancel'

/**
 * The next step for a visit, one click each. Which buttons show follows the
 * visit's state; the node still decides whether the actor may take the step
 * (a special or out-of-hours request needs the Officer in Charge).
 */
export function VisitActions({ visit, className }: { visit: Pick<Visit, 'id' | 'status' | 'visitorName' | 'privileged'>; className?: string }) {
  const action = useVisitAction()
  const [dialog, setDialog] = useState<Dialogs>(null)

  const run = (name: VisitAction, done: string, body?: unknown, after?: () => void) =>
    action.mutate(
      { id: visit.id, action: name, body },
      {
        onSuccess: () => {
          t.success(done, { description: visit.visitorName })
          after?.()
        },
        onError: (error) => t.error(m.visits_could_not_do_that(), { description: error instanceof ApiError ? error.message : m.visits_please_try_again() }),
      },
    )

  const busy = action.isPending

  return (
    <div className={className ?? 'flex flex-wrap items-center gap-1.5'}>
      {visit.status === 'requested' && (
        <>
          <Button size="xs" disabled={busy} onClick={() => run('approve', m.visits_visit_approved())}>
            <HugeiconsIcon icon={CheckmarkCircle02Icon} size={12} /> {m.visits_approve()}
          </Button>
          <Button size="xs" variant="secondary" disabled={busy} onClick={() => setDialog('deny')}>
            {m.visits_refuse()}
          </Button>
        </>
      )}
      {visit.status === 'scheduled' && (
        <>
          <Button size="xs" disabled={busy} onClick={() => setDialog('check-in')}>
            <HugeiconsIcon icon={Login01Icon} size={12} /> {m.visits_check_in()}
          </Button>
          <Button size="xs" variant="secondary" disabled={busy} onClick={() => run('no-show', m.visits_marked_as_a_no_show())}>
            {m.visits_no_show()}
          </Button>
        </>
      )}
      {visit.status === 'checked_in' && (
        <>
          <Button size="xs" disabled={busy} onClick={() => run('start', m.visits_visit_started())}>
            <HugeiconsIcon icon={PlayIcon} size={12} /> {m.visits_start_visit()}
          </Button>
          <Button size="xs" variant="secondary" disabled={busy} onClick={() => setDialog('deny')}>
            <HugeiconsIcon icon={UserBlock01Icon} size={12} /> {m.visits_turn_away()}
          </Button>
        </>
      )}
      {visit.status === 'in_progress' && (
        <Button size="xs" disabled={busy} onClick={() => run('complete', m.visits_visit_completed())}>
          <HugeiconsIcon icon={CheckmarkCircle02Icon} size={12} /> {m.visits_complete()}
        </Button>
      )}
      {['requested', 'scheduled', 'checked_in'].includes(visit.status) && (
        <Button size="xs" variant="ghost" disabled={busy} onClick={() => setDialog('cancel')}>
          {m.visits_cancel()}
        </Button>
      )}

      <CheckInDialog
        open={dialog === 'check-in'}
        onOpenChange={(open) => setDialog(open ? 'check-in' : null)}
        visit={visit}
        onTurnAway={() => setDialog('deny')}
      />
      <ReasonDialog
        open={dialog === 'deny'}
        onOpenChange={(open) => setDialog(open ? 'deny' : null)}
        title={visit.status === 'checked_in' || visit.status === 'scheduled' ? m.visits_turn_the_visitor_away() : m.visits_refuse_this_visit()}
        description={m.visits_record_the_reason_it_stays_on()}
        label={m.visits_reason()}
        confirm={m.visits_record_refusal()}
        destructive
        pending={busy}
        onConfirm={(reason) => run('deny', m.visits_visit_refused(), { reason }, () => setDialog(null))}
      />
      <ReasonDialog
        open={dialog === 'cancel'}
        onOpenChange={(open) => setDialog(open ? 'cancel' : null)}
        title={m.visits_cancel_this_visit()}
        description={m.visits_say_why_it_is_cancelled()}
        label={m.visits_reason()}
        confirm={m.visits_cancel_visit()}
        pending={busy}
        onConfirm={(reason) => run('cancel', m.visits_visit_cancelled(), { reason }, () => setDialog(null))}
      />
    </div>
  )
}

function ReasonDialog({
  open,
  onOpenChange,
  title,
  description,
  label,
  confirm,
  destructive,
  pending,
  onConfirm,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: string
  label: string
  confirm: string
  destructive?: boolean
  pending?: boolean
  onConfirm: (reason: string) => void
}) {
  const [reason, setReason] = useState('')
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setReason('')
        onOpenChange(next)
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <Field>
          <FieldLabel>{label}</FieldLabel>
          <Input autoFocus autoComplete="off" value={reason} onChange={(event) => setReason(event.target.value)} />
        </Field>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {m.visits_back()}
          </Button>
          <Button variant={destructive ? 'destructive' : 'default'} disabled={pending || !reason.trim()} onClick={() => onConfirm(reason.trim())}>
            {confirm}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

type Item = { description: string; disposition: string }

/** The gate: identification and search first, then anything the visitor
 * brought, then the visitor goes in. Refusing either is a turn-away. */
function CheckInDialog({
  open,
  onOpenChange,
  visit,
  onTurnAway,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  visit: Pick<Visit, 'id' | 'visitorName'>
  onTurnAway: () => void
}) {
  const action = useVisitAction()
  const [idVerified, setIdVerified] = useState(false)
  const [searchDone, setSearchDone] = useState(false)
  const [items, setItems] = useState<Item[]>([])

  const reset = () => {
    setIdVerified(false)
    setSearchDone(false)
    setItems([])
  }

  const submit = () =>
    action.mutate(
      { id: visit.id, action: 'check-in', body: { idVerified, searchDone, items: items.filter((i) => i.description.trim()) } },
      {
        onSuccess: () => {
          t.success(m.visits_checked_in(), { description: visit.visitorName })
          reset()
          onOpenChange(false)
        },
        onError: (error) => t.error(m.visits_could_not_check_in(), { description: error instanceof ApiError ? error.message : m.visits_please_try_again() }),
      },
    )

  const setItem = (index: number, patch: Partial<Item>) => setItems((prev) => prev.map((item, i) => (i === index ? { ...item, ...patch } : item)))

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset()
        onOpenChange(next)
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{m.visits_check_in_2({ visitorName: visit.visitorName })}</DialogTitle>
          <DialogDescription>{m.visits_photographic_id_and_a_search_come()}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <Field orientation="horizontal">
            <Switch checked={idVerified} onCheckedChange={setIdVerified} />
            <FieldLabel>{m.visits_photographic_id_checked_against_the_visi()}</FieldLabel>
          </Field>
          <Field orientation="horizontal">
            <Switch checked={searchDone} onCheckedChange={setSearchDone} />
            <FieldLabel>{m.visits_visitor_and_belongings_searched()}</FieldLabel>
          </Field>
        </div>

        <div className="flex flex-col gap-2">
          <span className="text-xs font-medium">{m.visits_items_brought_for_the_prisoner()}</span>
          {items.map((item, index) => (
            <div key={index} className="flex flex-wrap items-center gap-2">
              <Input
                autoComplete="off"
                className="min-w-40 flex-1"
                placeholder={m.visits_what_is_it()}
                value={item.description}
                onChange={(event) => setItem(index, { description: event.target.value })}
              />
              <select
                aria-label={m.visits_what_happens_to_it()}
                value={item.disposition}
                onChange={(event) => setItem(index, { disposition: event.target.value })}
                className="h-8 rounded-md border border-border bg-background px-2 text-xs outline-none focus:border-primary"
              >
                {itemDispositions.map((d) => (
                  <option key={d.value} value={d.value}>
                    {d.label}
                  </option>
                ))}
              </select>
              <Button size="xs" variant="ghost" onClick={() => setItems((prev) => prev.filter((_, i) => i !== index))}>
                {m.visits_remove()}
              </Button>
            </div>
          ))}
          <div>
            <Button size="xs" variant="secondary" onClick={() => setItems((prev) => [...prev, { description: '', disposition: 'handed_over' }])}>
              {m.visits_add_an_item()}
            </Button>
          </div>
          <FieldDescription>{m.visits_leave_empty_if_the_visitor_brought()}</FieldDescription>
        </div>

        <DialogFooter className="flex-wrap">
          <Button
            variant="ghost"
            onClick={() => {
              reset()
              onOpenChange(false)
              onTurnAway()
            }}
          >
            {m.visits_refused_id_or_search_turn_away()}
          </Button>
          <Button disabled={action.isPending || !idVerified || !searchDone} onClick={submit}>
            {m.visits_check_in()}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
