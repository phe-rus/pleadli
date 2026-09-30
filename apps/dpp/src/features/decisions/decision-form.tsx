import { formatDate } from '@/lib/dates'
import { serviceNames } from '@/lib/jurisdiction'
import { ApiError } from '@/lib/api'
import { DirectionsEditor, type DirectionDraft } from '@/features/directions'
import { useReportDirty } from '@/hooks/use-report-dirty'
import { chargingDecisionTypes, permittedDecisions, reasonedDecisionTypes, standardLabel, type ChargingReview } from '@/features/charging-review/schema'
import { useChargesForFile } from '@/features/charges'
import { useFilePeople } from '@/features/prosecution-files'
import { useProsecutorProfile } from '@/features/prosecutor-profile'
import { RichTextInput } from '@pleadli/rich-text'
import { useEffect } from 'react'
import { useAppForm } from '@pleadli/forms-tables/forms'
import { Badge } from '@pleadli/ui/badge'
import { Checkbox } from '@pleadli/ui/checkbox'
import { DrawerFooter } from '@pleadli/ui/drawer'
import { Field, FieldDescription, FieldLabel } from '@pleadli/ui/field'
import { Input } from '@pleadli/ui/input'
import { t } from '@pleadli/ui/goey-toaster'
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@pleadli/ui/select'
import { useCreateDecision } from './queries'
import { availableDecisionTypes, createDecisionSchema, decisionTypeDelegable, decisionTypeLabel, type Decision } from './schema'
import * as m from '@/paraglide/messages'

export type DecisionFormProps = {
  prosecutionFileId: string
  /** The open review this decision would conclude. Charging decisions need one. */
  review?: ChargingReview
  /** A decision of this file being corrected (not one that needs a review). */
  corrects?: Decision
  onSuccess?: (decisions: Decision[]) => void
  onDirtyChange?: (dirty: boolean) => void
}

function toDatetimeLocal(ms: number) {
  const d = new Date(ms)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/**
 * Records a formal decision as an auditable event (docs/dpp/PRODUCT.md
 * §Decisions & Reviews). A decision that is the outcome of a test (sanction,
 * decline, divert, threshold charge, return) is only offered when the open
 * review supports it, and the server refuses it otherwise. A decision can be
 * about the whole file or about chosen counts, and a correction says what it
 * corrects and why.
 */
export function DecisionForm({ prosecutionFileId, review, corrects, onSuccess, onDirtyChange }: DecisionFormProps) {
  const createDecision = useCreateDecision()
  const { data: profile } = useProsecutorProfile()
  const { data: charges } = useChargesForFile(prosecutionFileId)
  const { data: people } = useFilePeople(prosecutionFileId)

  const permitted = review ? permittedDecisions(review) : []
  const allowed = (type: string) => !chargingDecisionTypes.includes(type) || permitted.includes(type)
  // While correcting a decision, a charging outcome needs a reopening review, not this form.
  const options = availableDecisionTypes().filter((d) => !(corrects && chargingDecisionTypes.includes(d.value)))

  const form = useAppForm({
    defaultValues: {
      decisionType: '',
      decidedBy: '',
      decidedAt: toDatetimeLocal(Date.now()),
      reasons: '',
      chargeIds: corrects?.chargeId ? [corrects.chargeId] : ([] as string[]),
      concludeReview: true,
      directions: [] as DirectionDraft[],
    },
    validators: {
      onSubmit: ({ value }) => {
        const parsed = createDecisionSchema.safeParse(toInput(value))
        return parsed.success ? undefined : parsed.error.issues[0]?.message
      },
    },
    onSubmit: async ({ value, formApi }) => {
      try {
        const result = await createDecision.mutateAsync(toInput(value))
        t.success(result.length > 1 ? m["decision.form.recorded_many"]({ count: result.length }) : m["decision.form.recorded"]())
        formApi.reset()
        onSuccess?.(result)
      } catch (error) {
        // The server's own refusal is written to be read (that only the DPP may
        // discontinue, or what the review has not yet found), so it is shown.
        t.error(m["decision.form.record_failed"](), { description: error instanceof ApiError ? error.message : m["common.try_again"]() })
      }
    },
  })

  function toInput(value: (typeof form)['state']['values']) {
    const gated = chargingDecisionTypes.includes(value.decisionType)
    return {
      ...value,
      prosecutionFileId,
      decidedAt: new Date(value.decidedAt).getTime(),
      directions: value.decisionType === 'return_for_investigation' ? value.directions : [],
      reviewId: gated ? (review?.id ?? null) : null,
      correctsDecisionId: corrects?.id ?? null,
    }
  }

  useReportDirty(form, onDirtyChange)

  // Prefills from the prosecutor's own profile rather than retyping every time.
  useEffect(() => {
    if (profile?.name && !form.getFieldValue('decidedBy')) form.setFieldValue('decidedBy', profile.name)
  }, [profile, form])

  const accusedOf = (personId: string | null) => {
    const link = people.find((p) => p.personId === personId)
    return link ? `${link.personLastName}, ${link.personFirstName}` : m["decision.form.no_accused"]()
  }
  const byAccused = new Map<string, typeof charges>()
  for (const charge of charges) byAccused.set(charge.accusedPersonId ?? '', [...(byAccused.get(charge.accusedPersonId ?? '') ?? []), charge])

  return (
    <form
      className="flex flex-1 flex-col gap-4 overflow-y-auto p-4"
      onSubmit={(event) => {
        event.preventDefault()
        void form.handleSubmit()
      }}
    >
      {corrects && (
        <p className="rounded-md border border-border bg-muted/40 p-3">
          {m["decision.form.correcting_before"]()} <strong>{decisionTypeLabel(corrects.decisionType)}</strong> {m["decision.form.correcting_after"]({ date: formatDate(corrects.decidedAt) })}
        </p>
      )}
      {review && !corrects && (
        <p className="rounded-md border border-border bg-muted/40 p-3">
          {m["decision.form.review_outcome"]({ standard: standardLabel(review.standard), date: formatDate(review.startedAt) })}
        </p>
      )}

      <form.AppField name="decisionType">
        {(f) => (
          <Field>
            <FieldLabel>{m["decision.form.decision"]()}</FieldLabel>
            <Select items={options} value={f.state.value} onValueChange={(value) => f.handleChange(value ?? f.state.value)}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder={m["decision.form.decision_placeholder"]()} />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {options.map((d) => {
                    const dppBlocked = !d.delegable && !profile?.isDpp
                    return (
                      <SelectItem key={d.value} value={d.value} disabled={dppBlocked || !allowed(d.value)}>
                        {d.label}
                        {dppBlocked ? ` (${m["decision.form.dpp_only"]({ head: serviceNames().headShort })})` : !allowed(d.value) ? (review ? ` (${m["decision.form.review_not_support"]()})` : ` (${m["decision.form.needs_review"]()})`) : ''}
                      </SelectItem>
                    )
                  })}
                </SelectGroup>
              </SelectContent>
            </Select>
            {!review && !corrects && (
              <FieldDescription>{m["decision.form.needs_review_hint"]()}</FieldDescription>
            )}
            {f.state.value && !decisionTypeDelegable(f.state.value) && (
              <FieldDescription>
                <Badge variant="secondary" className="mr-1.5">
                  {m["decision.form.dpp_only"]({ head: serviceNames().headShort })}
                </Badge>
                {m["decision.form.not_delegable"]({ head: serviceNames().head })}
                {!profile?.isDpp && ` ${m["decision.form.not_dpp_refuse"]()}`}
              </FieldDescription>
            )}
          </Field>
        )}
      </form.AppField>

      {charges.length > 0 && !corrects?.chargeId && (
        <form.AppField name="chargeIds">
          {(f) => (
            <Field>
              <FieldLabel>{m["decision.form.applies_to"]()}</FieldLabel>
              <label className="flex items-center gap-2">
                <Checkbox checked={f.state.value.length === 0} onCheckedChange={() => f.handleChange([])} />
                {m["decision.form.whole_file"]()}
              </label>
              {[...byAccused.entries()].map(([personId, counts]) => {
                const ids = counts.map((c) => c.id)
                const all = ids.every((id) => f.state.value.includes(id))
                return (
                  <div key={personId} className="flex flex-col gap-1 rounded-md border border-border/60 p-2">
                    <label className="flex items-center gap-2">
                      <Checkbox checked={all} onCheckedChange={() => f.handleChange(all ? f.state.value.filter((id) => !ids.includes(id)) : [...new Set([...f.state.value, ...ids])])} />
                      <strong>{accusedOf(personId || null)}</strong>
                      <span className="text-muted-foreground">{m["decision.form.all_counts"]()}</span>
                    </label>
                    {counts.map((charge) => (
                      <label key={charge.id} className="flex items-center gap-2 pl-6">
                        <Checkbox
                          checked={f.state.value.includes(charge.id)}
                          onCheckedChange={(checked) => f.handleChange(checked ? [...f.state.value, charge.id] : f.state.value.filter((id) => id !== charge.id))}
                        />
                        {charge.offence}
                        {charge.statutorySection ? ` (${charge.statutorySection})` : ''}
                      </label>
                    ))}
                  </div>
                )
              })}
              <FieldDescription>{m["decision.form.counts_hint"]()}</FieldDescription>
            </Field>
          )}
        </form.AppField>
      )}

      <form.Subscribe selector={(state) => state.values.decisionType}>
        {(type) =>
          type === 'return_for_investigation' && (
            <form.AppField name="directions">
              {(f) => (
                <DirectionsEditor
                  value={f.state.value}
                  onChange={f.handleChange}
                  people={people.map((p) => ({ id: p.personId, name: `${p.personLastName}, ${p.personFirstName}` }))}
                />
              )}
            </form.AppField>
          )
        }
      </form.Subscribe>

      <div className="grid grid-cols-2 gap-3">
        <form.AppField name="decidedBy">{(f) => <f.input label={m["decision.form.decided_by_optional"]()} placeholder={m["review_note.form.author_placeholder"]()} />}</form.AppField>
        <form.AppField name="decidedAt">
          {(f) => (
            <Field>
              <FieldLabel>{m["decision.form.decided_at"]()}</FieldLabel>
              <Input type="datetime-local" value={f.state.value} onChange={(e) => f.handleChange(e.target.value)} />
            </Field>
          )}
        </form.AppField>
      </div>

      <form.Subscribe selector={(state) => state.values.decisionType}>
        {(type) => {
          const required = Boolean(corrects) || reasonedDecisionTypes.includes(type)
          return (
            <form.AppField name="reasons">
              {(f) => (
                <Field>
                  <FieldLabel>{type === 'return_for_investigation' ? m["decision.form.covering_note_optional"]() : required ? m["decision.form.reasons_required"]() : m["decision.form.reasons_optional"]()}</FieldLabel>
                  <RichTextInput value={f.state.value} onChange={f.handleChange} placeholder={m["decision.form.reasons_placeholder"]()} />
                  <FieldDescription>{m["decision.form.privileged_hint"]({ office: serviceNames().short })}</FieldDescription>
                </Field>
              )}
            </form.AppField>
          )
        }}
      </form.Subscribe>

      {review && !corrects && (
        <form.AppField name="concludeReview">
          {(f) => (
            <label className="flex items-start gap-2">
              <Checkbox checked={f.state.value} onCheckedChange={(checked) => f.handleChange(Boolean(checked))} />
              <span>
                {m["decision.form.completes_review"]()}
                <FieldDescription>{m["decision.form.completes_review_hint"]()}</FieldDescription>
              </span>
            </label>
          )}
        </form.AppField>
      )}

      <DrawerFooter>
        <form.AppForm>
          <form.submit label={m["decision.form.submit"]()} />
        </form.AppForm>
      </DrawerFooter>
    </form>
  )
}
