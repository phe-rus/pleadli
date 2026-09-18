import { ProcedureShell, type ProcedureStep } from '@/components/procedure'
import { usePrisoner, prisonerFullName } from '@/features/prisoners'
import { propertyRecordsForPrisonerOptions, useReturnPropertyRecord } from '@/features/property-records'
import { usePermissions } from '@/features/session'
import { ApiError } from '@/lib/api'
import { fromDatetimeLocal, toDatetimeLocal } from '@/lib/datetime'
import { Badge } from '@pleadli/ui/badge'
import { Button } from '@pleadli/ui/button'
import { Field, FieldDescription, FieldLabel } from '@pleadli/ui/field'
import { t } from '@pleadli/ui/goey-toaster'
import { Input } from '@pleadli/ui/input'
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@pleadli/ui/select'
import { Textarea } from '@pleadli/ui/textarea'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { format } from 'date-fns/format'
import { useMemo, useState } from 'react'
import { useCreateRelease, useDischargeCheck, dischargeCheckOptions } from './queries'
import { isEntitlementRelease, releaseTypeLabel, releaseTypes, type GateCheck } from './schema'

type StepId = 'authority' | 'gates' | 'exception' | 'confirm'

/** East Africa Time hour (UTC+3, no daylight saving): s.83 discharge is before noon. */
function eatHour(ms: number) {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Africa/Kampala', hour: '2-digit', hourCycle: 'h23' }).formatToParts(ms)
  return Number(parts.find((p) => p.type === 'hour')?.value ?? '0')
}

function errorMessage(error: unknown) {
  if (error instanceof ApiError) {
    switch (error.code) {
      case 'DISCHARGE_GATES_UNMET':
        return 'A gate is still unmet. Complete it, or record an exception authorised by the Officer in Charge.'
      case 'EXCEPTION_NEEDS_OIC':
        return 'Only an Officer in Charge can authorise discharge without a gate being met. Enter their badge number and password.'
      case 'EXCEPTION_REASON_REQUIRED':
        return 'Record the reason for the exception.'
      case 'NOT_IN_CUSTODY':
        return 'This person is not in custody here, so there is no one to discharge.'
      case 'INVALID_CREDENTIALS':
        return 'The badge number or password was not accepted.'
      default:
        return error.message
    }
  }
  return 'Please try again.'
}

export function DischargeProcedure({ prisonerId }: { prisonerId: string }) {
  const { data: prisoner } = usePrisoner(prisonerId)
  const assessmentQuery = useDischargeCheck(prisonerId)
  const propertyQuery = useQuery(propertyRecordsForPrisonerOptions(prisonerId))
  const returnProperty = useReturnPropertyRecord(prisonerId)
  const createRelease = useCreateRelease()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const { can } = usePermissions()
  const canAuthorise = can('authorise.exception')

  const [current, setCurrent] = useState<StepId>('authority')
  const [releaseType, setReleaseType] = useState('')
  const [basis, setBasis] = useState('')
  const [orderedBy, setOrderedBy] = useState('')
  const [releasedAt, setReleasedAt] = useState(() => toDatetimeLocal(Date.now()))
  const [notes, setNotes] = useState('')
  const [reason, setReason] = useState('')
  const [badgeNumber, setBadgeNumber] = useState('')
  const [password, setPassword] = useState('')
  const [formError, setFormError] = useState<string | null>(null)

  const assessment = assessmentQuery.data
  const blockingUnmet = useMemo(() => (assessment?.gates ?? []).filter((g) => g.blocking && !g.met), [assessment])
  const needsException = blockingUnmet.length > 0

  if (!prisoner) {
    return (
      <article className="container flex flex-col gap-3 pt-5 pb-20">
        <p className="text-sm text-muted-foreground">This prisoner could not be found.</p>
      </article>
    )
  }

  if (assessment && !assessment.inCustody) {
    return (
      <article className="container flex flex-col gap-3 pt-5 pb-20">
        <h1>Discharge</h1>
        <p className="text-sm text-muted-foreground">
          {prisonerFullName(prisoner)} is not in custody here, so there is no one to discharge. Their file shows where they are now.
        </p>
        <Button variant="secondary" className="w-fit" onClick={() => navigate({ to: '/prisoners/$prisonerId', params: { prisonerId } })}>
          Back to the prisoner file
        </Button>
      </article>
    )
  }

  const releasedAtMs = fromDatetimeLocal(releasedAt)
  const afterNoon = isEntitlementRelease(releaseType) && Number.isFinite(releasedAtMs) && eatHour(releasedAtMs) >= 12
  const authorityDone = releaseType !== '' && basis.trim() !== ''
  const exceptionDone = !needsException || (reason.trim() !== '' && (canAuthorise || (badgeNumber.trim() !== '' && password !== '')))

  const steps: ProcedureStep[] = [
    { id: 'authority', label: 'Authority', summary: releaseType ? releaseTypeLabel(releaseType) : null, done: authorityDone },
    {
      id: 'gates',
      label: 'Gates',
      summary: assessment ? (needsException ? `${blockingUnmet.length} unmet` : 'All met') : 'Checking',
      done: Boolean(assessment) && !needsException,
    },
    ...(needsException ? [{ id: 'exception', label: 'Exception', summary: exceptionDone ? 'Recorded' : 'Needed', done: exceptionDone }] : []),
    { id: 'confirm', label: 'Confirm' },
  ]

  const stepIds = steps.map((s) => s.id as StepId)
  const activeId: StepId = stepIds.includes(current) ? current : 'confirm'
  const index = stepIds.indexOf(activeId)
  const previous = index > 0 ? stepIds[index - 1] : null
  const next = index < stepIds.length - 1 ? stepIds[index + 1] : null

  const readyToSubmit = authorityDone && Boolean(assessment) && exceptionDone

  const submit = async () => {
    setFormError(null)
    if (!readyToSubmit) {
      setFormError('Complete the authority step' + (needsException ? ' and the exception' : '') + ' first.')
      return
    }
    try {
      await createRelease.mutateAsync({
        prisonerId,
        releaseType,
        releasedAt: releasedAtMs,
        orderedBy,
        basis,
        notes,
        exception: needsException
          ? { reason, authoriser: canAuthorise ? null : { badgeNumber: badgeNumber.trim(), password } }
          : null,
      })
      t.success('Discharge recorded')
      navigate({ to: '/prisoners/$prisonerId', params: { prisonerId } })
    } catch (error) {
      const message = errorMessage(error)
      setFormError(message)
      t.error('Could not record the discharge', { description: message })
      queryClient.invalidateQueries({ queryKey: dischargeCheckOptions(prisonerId).queryKey })
    }
  }

  const markReturned = async (id: string) => {
    try {
      await returnProperty.mutateAsync({ id, input: { returnedAt: Date.now(), returnedNote: 'Handed back at discharge' } })
      await queryClient.invalidateQueries({ queryKey: dischargeCheckOptions(prisonerId).queryKey })
    } catch {
      t.error('Could not mark as returned', { description: 'Please try again.' })
    }
  }

  const outstanding = (propertyQuery.data ?? []).filter((p) => p.returnedAt == null)

  return (
    <ProcedureShell
      title="Discharge"
      description="Record the authority, clear the gates, and discharge. If a gate cannot be met in time, the Officer in Charge can authorise an exception."
      backTo={`/prisoners/${prisonerId}`}
      backLabel="Back to the prisoner file"
      steps={steps}
      current={activeId}
      onSelect={(id) => setCurrent(id as StepId)}
      aside={
        <div className="flex flex-col gap-2 rounded-lg border border-border/60 p-3 text-sm">
          <span className="font-medium">{prisonerFullName(prisoner)}</span>
          <span className="text-xs text-muted-foreground">Admitted {format(prisoner.admittedAt, 'PP')}</span>
          {assessment?.releaseDueOn != null && (
            <span className="text-xs text-muted-foreground">Computed entitlement: {format(assessment.releaseDueOn, 'PP')}</span>
          )}
        </div>
      }
    >
      {activeId === 'authority' && (
        <div className="flex flex-col gap-4">
          <h2 className="text-base font-medium">Authority for the discharge</h2>
          <Field>
            <FieldLabel>Release type</FieldLabel>
            <Select items={releaseTypes} value={releaseType} onValueChange={(value) => setReleaseType(value ?? releaseType)}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select release type" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {releaseTypes.map((r) => (
                    <SelectItem key={r.value} value={r.value}>
                      {r.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>
          <Field>
            <FieldLabel>Basis and authority</FieldLabel>
            <Input value={basis} onChange={(e) => setBasis(e.target.value)} placeholder="Order, warrant or entitlement relied on, with reference" />
            <FieldDescription>For example the court order and its reference, or the entitlement date computed from the sentence.</FieldDescription>
          </Field>
          <div className="grid gap-3 md:grid-cols-2">
            <Field>
              <FieldLabel>Ordered by (optional)</FieldLabel>
              <Input value={orderedBy} onChange={(e) => setOrderedBy(e.target.value)} placeholder="Name or court" />
            </Field>
            <Field>
              <FieldLabel>Released at</FieldLabel>
              <Input type="datetime-local" value={releasedAt} onChange={(e) => setReleasedAt(e.target.value)} />
            </Field>
          </div>
          {assessment?.releaseDueOn != null && (
            <p className="text-xs text-muted-foreground">
              Computed entitlement date: {format(assessment.releaseDueOn, 'PPP')}. This is calculated from the recorded sentence; check it against the warrant.
            </p>
          )}
          {afterNoon && (
            <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm">
              s.83 requires discharge on entitlement before noon. This time is at or after 12:00 East Africa Time. The discharge can still be recorded, and the late
              time will be noted.
            </div>
          )}
          <Field>
            <FieldLabel>Notes (optional)</FieldLabel>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
          </Field>
        </div>
      )}

      {activeId === 'gates' && (
        <div className="flex flex-col gap-4">
          <h2 className="text-base font-medium">Gates</h2>
          {!assessment ? (
            <p className="text-sm text-muted-foreground">Checking the record.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {assessment.gates.map((gate) => (
                <GateRow key={gate.key} gate={gate} />
              ))}
            </ul>
          )}
          {outstanding.length > 0 && (
            <div className="flex flex-col gap-2">
              <h3 className="text-sm font-medium">Property to hand back</h3>
              <ul className="flex flex-col divide-y divide-border/60 rounded-md border border-border/60">
                {outstanding.map((item) => (
                  <li key={item.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                    <span className="truncate">{item.description}</span>
                    <Button size="sm" variant="secondary" disabled={returnProperty.isPending} onClick={() => markReturned(item.id)}>
                      Mark returned
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {needsException && (
            <p className="text-sm text-muted-foreground">
              A gate that is not met blocks discharge unless the Officer in Charge authorises an exception. That is the next step.
            </p>
          )}
        </div>
      )}

      {activeId === 'exception' && (
        <div className="flex flex-col gap-4">
          <h2 className="text-base font-medium">Exception authorised by the Officer in Charge</h2>
          <p className="text-sm text-muted-foreground">
            The Officer in Charge is responsible for discharge as soon as someone is entitled to release (s.83), so a gate must never keep a person in custody against a
            lawful order. The OIC may authorise discharge without these gates being met. The reason is recorded, and each waived gate becomes a task to regularise afterwards.
          </p>
          <ul className="flex flex-col gap-2">
            {blockingUnmet.map((gate) => (
              <GateRow key={gate.key} gate={gate} />
            ))}
          </ul>
          <Field>
            <FieldLabel>Reason for the exception</FieldLabel>
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} placeholder="Why the discharge cannot wait for these gates" />
          </Field>
          {canAuthorise ? (
            <p className="rounded-md border border-border/60 px-3 py-2 text-sm">You hold the exception authority, so this discharge will be authorised in your name.</p>
          ) : (
            <div className="flex flex-col gap-3 rounded-md border border-border/60 p-3">
              <p className="text-sm">Your role cannot authorise an exception. The Officer in Charge enters their own badge number and password here.</p>
              <div className="grid gap-3 md:grid-cols-2">
                <Field>
                  <FieldLabel>OIC badge number</FieldLabel>
                  <Input value={badgeNumber} onChange={(e) => setBadgeNumber(e.target.value)} autoComplete="off" />
                </Field>
                <Field>
                  <FieldLabel>OIC password</FieldLabel>
                  <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="off" />
                </Field>
              </div>
            </div>
          )}
        </div>
      )}

      {activeId === 'confirm' && (
        <div className="flex flex-col gap-4">
          <h2 className="text-base font-medium">Confirm the discharge</h2>
          <dl className="grid gap-x-6 gap-y-2 text-sm md:grid-cols-[160px_1fr]">
            <dt className="text-muted-foreground">Person</dt>
            <dd>{prisonerFullName(prisoner)}</dd>
            <dt className="text-muted-foreground">Release type</dt>
            <dd>{releaseType ? releaseTypeLabel(releaseType) : 'Not chosen'}</dd>
            <dt className="text-muted-foreground">Basis</dt>
            <dd>{basis || 'Not entered'}</dd>
            <dt className="text-muted-foreground">Released at</dt>
            <dd>{Number.isFinite(releasedAtMs) ? format(releasedAtMs, 'PPp') : 'Not entered'}</dd>
            {orderedBy && (
              <>
                <dt className="text-muted-foreground">Ordered by</dt>
                <dd>{orderedBy}</dd>
              </>
            )}
            <dt className="text-muted-foreground">Gates</dt>
            <dd>
              {needsException ? (
                <span className="flex flex-col gap-1">
                  {blockingUnmet.map((g) => (
                    <span key={g.key}>Waived by exception: {g.label}</span>
                  ))}
                  <span className="text-muted-foreground">Reason: {reason || 'Not entered'}</span>
                </span>
              ) : (
                'All met'
              )}
            </dd>
          </dl>
          {afterNoon && <Badge variant="outline">After noon: will be noted</Badge>}
          {formError && <p className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">{formError}</p>}
          {!readyToSubmit && <p className="text-sm text-muted-foreground">Some steps are not finished yet. Use the list on the left to complete them.</p>}
          <div>
            <Button onClick={submit} disabled={createRelease.isPending || !readyToSubmit}>
              {createRelease.isPending ? 'Recording' : needsException ? 'Discharge with exception' : 'Record discharge'}
            </Button>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between border-t border-border/60 pt-4">
        <Button variant="ghost" disabled={!previous} onClick={() => previous && setCurrent(previous)}>
          Back
        </Button>
        {next && (
          <Button variant="secondary" onClick={() => setCurrent(next)}>
            Next
          </Button>
        )}
      </div>
    </ProcedureShell>
  )
}

function GateRow({ gate }: { gate: GateCheck }) {
  const tone = gate.met ? 'text-emerald-600' : gate.blocking ? 'text-destructive' : 'text-amber-600'
  return (
    <li className="flex items-start justify-between gap-3 rounded-md border border-border/60 px-3 py-2">
      <div className="flex min-w-0 flex-col">
        <span className="text-sm">{gate.label}</span>
        {gate.detail && <span className="text-xs text-muted-foreground">{gate.detail}</span>}
      </div>
      <Badge variant={gate.met ? 'outline' : gate.blocking ? 'destructive' : 'secondary'} className={tone}>
        {gate.met ? 'Met' : gate.blocking ? 'Unmet, blocks' : 'Warning'}
      </Badge>
    </li>
  )
}
