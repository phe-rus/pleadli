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
import { m } from '@/paraglide/messages'

type StepId = 'authority' | 'gates' | 'exception' | 'confirm'

/** East Africa Time hour (UTC+3, no daylight saving): s.83 discharge is before noon. */
function eatHour(ms: number) {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: m.releases_africa_kampala(), hour: '2-digit', hourCycle: 'h23' }).formatToParts(ms)
  return Number(parts.find((p) => p.type === 'hour')?.value ?? '0')
}

function errorMessage(error: unknown) {
  if (error instanceof ApiError) {
    switch (error.code) {
      case 'DISCHARGE_GATES_UNMET':
        return m.releases_a_gate_is_still_unmet_complete()
      case 'EXCEPTION_NEEDS_OIC':
        return m.releases_only_an_officer_in_charge_can()
      case 'EXCEPTION_REASON_REQUIRED':
        return m.releases_record_the_reason_for_the_exception()
      case 'NOT_IN_CUSTODY':
        return m.releases_this_person_is_not_in_custody()
      case 'INVALID_CREDENTIALS':
        return m.releases_the_badge_number_or_password_was()
      default:
        return error.message
    }
  }
  return m.releases_please_try_again()
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
        <p className="text-sm text-muted-foreground">{m.releases_this_prisoner_could_not_be_found()}</p>
      </article>
    )
  }

  if (assessment && !assessment.inCustody) {
    return (
      <article className="container flex flex-col gap-3 pt-5 pb-20">
        <h1>{m.releases_discharge()}</h1>
        <p className="text-sm text-muted-foreground">
          {m.releases_is_not_in_custody_here_so({ prisoner: prisonerFullName(prisoner) })}</p>
        <Button variant="secondary" className="w-fit" onClick={() => navigate({ to: '/prisoners/$prisonerId', params: { prisonerId } })}>
          {m.releases_back_to_the_prisoner_file()}
        </Button>
      </article>
    )
  }

  const releasedAtMs = fromDatetimeLocal(releasedAt)
  const afterNoon = isEntitlementRelease(releaseType) && Number.isFinite(releasedAtMs) && eatHour(releasedAtMs) >= 12
  const authorityDone = releaseType !== '' && basis.trim() !== ''
  const exceptionDone = !needsException || (reason.trim() !== '' && (canAuthorise || (badgeNumber.trim() !== '' && password !== '')))

  const steps: ProcedureStep[] = [
    { id: 'authority', label: m.releases_authority(), summary: releaseType ? releaseTypeLabel(releaseType) : null, done: authorityDone },
    {
      id: 'gates',
      label: m.releases_gates(),
      summary: assessment ? (needsException ? m.releases_n_unmet({ count: blockingUnmet.length }) : m.releases_all_met()) : m.releases_checking(),
      done: Boolean(assessment) && !needsException,
    },
    ...(needsException ? [{ id: 'exception', label: m.releases_exception(), summary: exceptionDone ? m.releases_recorded() : m.releases_needed(), done: exceptionDone }] : []),
    { id: 'confirm', label: m.releases_confirm() },
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
      setFormError(needsException ? m.releases_complete_authority_and_exception() : m.releases_complete_authority())
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
      t.success(m.releases_discharge_recorded())
      navigate({ to: '/prisoners/$prisonerId', params: { prisonerId } })
    } catch (error) {
      const message = errorMessage(error)
      setFormError(message)
      t.error(m.releases_could_not_record_the_discharge(), { description: message })
      queryClient.invalidateQueries({ queryKey: dischargeCheckOptions(prisonerId).queryKey })
    }
  }

  const markReturned = async (id: string) => {
    try {
      await returnProperty.mutateAsync({ id, input: { returnedAt: Date.now(), returnedNote: m.releases_handed_back_at_discharge() } })
      await queryClient.invalidateQueries({ queryKey: dischargeCheckOptions(prisonerId).queryKey })
    } catch {
      t.error(m.releases_could_not_mark_as_returned(), { description: m.releases_please_try_again() })
    }
  }

  const outstanding = (propertyQuery.data ?? []).filter((p) => p.returnedAt == null)

  return (
    <ProcedureShell
      title={m.releases_discharge()}
      description={m.releases_record_the_authority_clear_the_gates()}
      backTo={`/prisoners/${prisonerId}`}
      backLabel={m.releases_back_to_the_prisoner_file()}
      steps={steps}
      current={activeId}
      onSelect={(id) => setCurrent(id as StepId)}
      aside={
        <div className="flex flex-col gap-2 rounded-lg border border-border/60 p-3 text-sm">
          <span className="font-medium">{prisonerFullName(prisoner)}</span>
          <span className="text-xs text-muted-foreground">{m.releases_admitted({ admittedAt: format(prisoner.admittedAt, 'PP') })}</span>
          {assessment?.releaseDueOn != null && (
            <span className="text-xs text-muted-foreground">{m.releases_computed_entitlement({ releaseDueOn: format(assessment.releaseDueOn, 'PP') })}</span>
          )}
        </div>
      }
    >
      {activeId === 'authority' && (
        <div className="flex flex-col gap-4">
          <h2 className="text-base font-medium">{m.releases_authority_for_the_discharge()}</h2>
          <Field>
            <FieldLabel>{m.releases_release_type()}</FieldLabel>
            <Select items={releaseTypes} value={releaseType} onValueChange={(value) => setReleaseType(value ?? releaseType)}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder={m.releases_select_release_type()} />
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
            <FieldLabel>{m.releases_basis_and_authority()}</FieldLabel>
            <Input value={basis} onChange={(e) => setBasis(e.target.value)} placeholder={m.releases_order_warrant_or_entitlement_relied_on()} />
            <FieldDescription>{m.releases_for_example_the_court_order_and()}</FieldDescription>
          </Field>
          <div className="grid gap-3 md:grid-cols-2">
            <Field>
              <FieldLabel>{m.releases_ordered_by_optional()}</FieldLabel>
              <Input value={orderedBy} onChange={(e) => setOrderedBy(e.target.value)} placeholder={m.releases_name_or_court()} />
            </Field>
            <Field>
              <FieldLabel>{m.releases_released_at()}</FieldLabel>
              <Input type="datetime-local" value={releasedAt} onChange={(e) => setReleasedAt(e.target.value)} />
            </Field>
          </div>
          {assessment?.releaseDueOn != null && (
            <p className="text-xs text-muted-foreground">
              {m.releases_computed_entitlement_date_this_is_calcul({ releaseDueOn: format(assessment.releaseDueOn, 'PPP') })}</p>
          )}
          {afterNoon && (
            <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm">
              {m.releases_s_83_requires_discharge_on_entitlement()}
            </div>
          )}
          <Field>
            <FieldLabel>{m.releases_notes_optional()}</FieldLabel>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
          </Field>
        </div>
      )}

      {activeId === 'gates' && (
        <div className="flex flex-col gap-4">
          <h2 className="text-base font-medium">{m.releases_gates()}</h2>
          {!assessment ? (
            <p className="text-sm text-muted-foreground">{m.releases_checking_the_record()}</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {assessment.gates.map((gate) => (
                <GateRow key={gate.key} gate={gate} />
              ))}
            </ul>
          )}
          {outstanding.length > 0 && (
            <div className="flex flex-col gap-2">
              <h3 className="text-sm font-medium">{m.releases_property_to_hand_back()}</h3>
              <ul className="flex flex-col divide-y divide-border/60 rounded-md border border-border/60">
                {outstanding.map((item) => (
                  <li key={item.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                    <span className="truncate">{item.description}</span>
                    <Button size="sm" variant="secondary" disabled={returnProperty.isPending} onClick={() => markReturned(item.id)}>
                      {m.releases_mark_returned()}
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {needsException && (
            <p className="text-sm text-muted-foreground">
              {m.releases_a_gate_that_is_not_met()}
            </p>
          )}
        </div>
      )}

      {activeId === 'exception' && (
        <div className="flex flex-col gap-4">
          <h2 className="text-base font-medium">{m.releases_exception_authorised_by_the_officer_in()}</h2>
          <p className="text-sm text-muted-foreground">
            {m.releases_the_officer_in_charge_is_responsible()}
          </p>
          <ul className="flex flex-col gap-2">
            {blockingUnmet.map((gate) => (
              <GateRow key={gate.key} gate={gate} />
            ))}
          </ul>
          <Field>
            <FieldLabel>{m.releases_reason_for_the_exception()}</FieldLabel>
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} placeholder={m.releases_why_the_discharge_cannot_wait_for()} />
          </Field>
          {canAuthorise ? (
            <p className="rounded-md border border-border/60 px-3 py-2 text-sm">{m.releases_you_hold_the_exception_authority_so()}</p>
          ) : (
            <div className="flex flex-col gap-3 rounded-md border border-border/60 p-3">
              <p className="text-sm">{m.releases_your_role_cannot_authorise_an_exception()}</p>
              <div className="grid gap-3 md:grid-cols-2">
                <Field>
                  <FieldLabel>{m.releases_oic_badge_number()}</FieldLabel>
                  <Input value={badgeNumber} onChange={(e) => setBadgeNumber(e.target.value)} autoComplete="off" />
                </Field>
                <Field>
                  <FieldLabel>{m.releases_oic_password()}</FieldLabel>
                  <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="off" />
                </Field>
              </div>
            </div>
          )}
        </div>
      )}

      {activeId === 'confirm' && (
        <div className="flex flex-col gap-4">
          <h2 className="text-base font-medium">{m.releases_confirm_the_discharge()}</h2>
          <dl className="grid gap-x-6 gap-y-2 text-sm md:grid-cols-[160px_1fr]">
            <dt className="text-muted-foreground">{m.releases_person()}</dt>
            <dd>{prisonerFullName(prisoner)}</dd>
            <dt className="text-muted-foreground">{m.releases_release_type()}</dt>
            <dd>{releaseType ? releaseTypeLabel(releaseType) : m.releases_not_chosen()}</dd>
            <dt className="text-muted-foreground">{m.releases_basis()}</dt>
            <dd>{basis || m.releases_not_entered()}</dd>
            <dt className="text-muted-foreground">{m.releases_released_at()}</dt>
            <dd>{Number.isFinite(releasedAtMs) ? format(releasedAtMs, 'PPp') : m.releases_not_entered()}</dd>
            {orderedBy && (
              <>
                <dt className="text-muted-foreground">{m.releases_ordered_by()}</dt>
                <dd>{orderedBy}</dd>
              </>
            )}
            <dt className="text-muted-foreground">{m.releases_gates()}</dt>
            <dd>
              {needsException ? (
                <span className="flex flex-col gap-1">
                  {blockingUnmet.map((g) => (
                    <span key={g.key}>{m.releases_waived_by_exception({ label: g.label })}</span>
                  ))}
                  <span className="text-muted-foreground">{m.releases_reason_label({ reason: reason || m.releases_not_entered() })}</span>
                </span>
              ) : (
                m.releases_all_met()
              )}
            </dd>
          </dl>
          {afterNoon && <Badge variant="outline">{m.releases_after_noon_will_be_noted()}</Badge>}
          {formError && <p className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">{formError}</p>}
          {!readyToSubmit && <p className="text-sm text-muted-foreground">{m.releases_some_steps_are_not_finished_yet()}</p>}
          <div>
            <Button onClick={submit} disabled={createRelease.isPending || !readyToSubmit}>
              {createRelease.isPending ? m.releases_recording() : needsException ? m.releases_discharge_with_exception() : m.releases_record_discharge()}
            </Button>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between border-t border-border/60 pt-4">
        <Button variant="ghost" disabled={!previous} onClick={() => previous && setCurrent(previous)}>
          {m.releases_back()}
        </Button>
        {next && (
          <Button variant="secondary" onClick={() => setCurrent(next)}>
            {m.releases_next()}
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
        {gate.met ? m.releases_met() : gate.blocking ? m.releases_unmet_blocks() : m.releases_warning()}
      </Badge>
    </li>
  )
}
