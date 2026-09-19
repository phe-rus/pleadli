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
        onError: (error) => t.error('Could not do that', { description: error instanceof ApiError ? error.message : 'Please try again.' }),
      },
    )

  const busy = action.isPending

  return (
    <div className={className ?? 'flex flex-wrap items-center gap-1.5'}>
      {visit.status === 'requested' && (
        <>
          <Button size="xs" disabled={busy} onClick={() => run('approve', 'Visit approved')}>
            <HugeiconsIcon icon={CheckmarkCircle02Icon} size={12} /> Approve
          </Button>
          <Button size="xs" variant="secondary" disabled={busy} onClick={() => setDialog('deny')}>
            Refuse
          </Button>
        </>
      )}
      {visit.status === 'scheduled' && (
        <>
          <Button size="xs" disabled={busy} onClick={() => setDialog('check-in')}>
            <HugeiconsIcon icon={Login01Icon} size={12} /> Check in
          </Button>
          <Button size="xs" variant="secondary" disabled={busy} onClick={() => run('no-show', 'Marked as a no show')}>
            No show
          </Button>
        </>
      )}
      {visit.status === 'checked_in' && (
        <>
          <Button size="xs" disabled={busy} onClick={() => run('start', 'Visit started')}>
            <HugeiconsIcon icon={PlayIcon} size={12} /> Start visit
          </Button>
          <Button size="xs" variant="secondary" disabled={busy} onClick={() => setDialog('deny')}>
            <HugeiconsIcon icon={UserBlock01Icon} size={12} /> Turn away
          </Button>
        </>
      )}
      {visit.status === 'in_progress' && (
        <Button size="xs" disabled={busy} onClick={() => run('complete', 'Visit completed')}>
          <HugeiconsIcon icon={CheckmarkCircle02Icon} size={12} /> Complete
        </Button>
      )}
      {['requested', 'scheduled', 'checked_in'].includes(visit.status) && (
        <Button size="xs" variant="ghost" disabled={busy} onClick={() => setDialog('cancel')}>
          Cancel
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
        title={visit.status === 'checked_in' || visit.status === 'scheduled' ? 'Turn the visitor away' : 'Refuse this visit'}
        description="Record the reason. It stays on the visit and in the audit trail."
        label="Reason"
        confirm="Record refusal"
        destructive
        pending={busy}
        onConfirm={(reason) => run('deny', 'Visit refused', { reason }, () => setDialog(null))}
      />
      <ReasonDialog
        open={dialog === 'cancel'}
        onOpenChange={(open) => setDialog(open ? 'cancel' : null)}
        title="Cancel this visit"
        description="Say why it is cancelled."
        label="Reason"
        confirm="Cancel visit"
        pending={busy}
        onConfirm={(reason) => run('cancel', 'Visit cancelled', { reason }, () => setDialog(null))}
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
            Back
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
          t.success('Checked in', { description: visit.visitorName })
          reset()
          onOpenChange(false)
        },
        onError: (error) => t.error('Could not check in', { description: error instanceof ApiError ? error.message : 'Please try again.' }),
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
          <DialogTitle>Check in {visit.visitorName}</DialogTitle>
          <DialogDescription>Photographic ID and a search come before anyone goes in.</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <Field orientation="horizontal">
            <Switch checked={idVerified} onCheckedChange={setIdVerified} />
            <FieldLabel>Photographic ID checked against the visitor</FieldLabel>
          </Field>
          <Field orientation="horizontal">
            <Switch checked={searchDone} onCheckedChange={setSearchDone} />
            <FieldLabel>Visitor and belongings searched</FieldLabel>
          </Field>
        </div>

        <div className="flex flex-col gap-2">
          <span className="text-xs font-medium">Items brought for the prisoner</span>
          {items.map((item, index) => (
            <div key={index} className="flex flex-wrap items-center gap-2">
              <Input
                autoComplete="off"
                className="min-w-40 flex-1"
                placeholder="What is it"
                value={item.description}
                onChange={(event) => setItem(index, { description: event.target.value })}
              />
              <select
                aria-label="What happens to it"
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
                Remove
              </Button>
            </div>
          ))}
          <div>
            <Button size="xs" variant="secondary" onClick={() => setItems((prev) => [...prev, { description: '', disposition: 'handed_over' }])}>
              Add an item
            </Button>
          </div>
          <FieldDescription>Leave empty if the visitor brought nothing.</FieldDescription>
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
            Refused ID or search? Turn away
          </Button>
          <Button disabled={action.isPending || !idVerified || !searchDone} onClick={submit}>
            Check in
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
