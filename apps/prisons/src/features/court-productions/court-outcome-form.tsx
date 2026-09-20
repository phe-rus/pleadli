import { useReportDirty } from '@/hooks/use-report-dirty'
import { ApiError } from '@/lib/api'
import { fromDatetimeLocal, toDatetimeLocal } from '@/lib/datetime'
import { useAppForm } from '@pleadli/forms-tables/forms'
import { Button } from '@pleadli/ui/button'
import { DrawerFooter } from '@pleadli/ui/drawer'
import { Field, FieldLabel } from '@pleadli/ui/field'
import { Input } from '@pleadli/ui/input'
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@pleadli/ui/select'
import { t } from '@pleadli/ui/goey-toaster'
import { Textarea } from '@pleadli/ui/textarea'
import { useRecordCourtOutcome } from './queries'
import { courtOutcomes, type CourtOutcomeResult } from './schema'
import { m } from '@/paraglide/messages'

type CourtOutcomeFormProps = {
  productionId: string
  onSuccess?: (result: CourtOutcomeResult) => void
  onDirtyChange?: (dirty: boolean) => void
}

/**
 * Applies what a court decided to a scheduled production (W3): a remand books
 * the next date, a conviction makes the prisoner convicted, bail or acquittal
 * points at discharge. The node does the applying; this only records it.
 */
export function CourtOutcomeForm({ productionId, onSuccess, onDirtyChange }: CourtOutcomeFormProps) {
  const record = useRecordCourtOutcome()

  const form = useAppForm({
    defaultValues: { outcome: '', notes: '', nextDate: toDatetimeLocal(Date.now() + 14 * 86_400_000) },
    onSubmit: async ({ value }) => {
      const meta = courtOutcomes.find((o) => o.value === value.outcome)
      try {
        const result = await record.mutateAsync({
          productionId,
          outcome: value.outcome,
          notes: value.notes,
          nextDate: meta?.needsDate ? fromDatetimeLocal(value.nextDate) : null,
        })
        t.success(m.court_productions_outcome_recorded(), {
          description:
            result.followUp === 'discharge'
              ? m.court_productions_the_court_order_points_at_discharge()
              : result.followUp === 'sentence'
                ? m.court_productions_now_record_the_sentence_from_the()
                : undefined,
        })
        onSuccess?.(result)
      } catch (error) {
        t.error(m.court_productions_could_not_record_the_outcome(), { description: error instanceof ApiError ? error.message : m.court_productions_please_try_again() })
      }
    },
  })

  useReportDirty(form, onDirtyChange)

  return (
    <form
      className="panel-body"
      onSubmit={(event) => {
        event.preventDefault()
        form.handleSubmit()
      }}
    >
      <form.AppField name="outcome">
        {(f) => (
          <Field>
            <FieldLabel>{m.court_productions_what_did_the_court_decide()}</FieldLabel>
            <Select items={courtOutcomes} value={f.state.value} onValueChange={(value) => f.handleChange(value ?? f.state.value)}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder={m.court_productions_choose_the_outcome()} />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {courtOutcomes.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>
        )}
      </form.AppField>

      <form.Subscribe selector={(state) => state.values.outcome}>
        {(outcome) =>
          courtOutcomes.find((o) => o.value === outcome)?.needsDate ? (
            <form.AppField name="nextDate">
              {(f) => (
                <Field>
                  <FieldLabel>{m.court_productions_next_court_date()}</FieldLabel>
                  <Input type="datetime-local" value={f.state.value} onChange={(e) => f.handleChange(e.target.value)} />
                </Field>
              )}
            </form.AppField>
          ) : null
        }
      </form.Subscribe>

      <form.AppField name="notes">
        {(f) => (
          <Field>
            <FieldLabel>{m.court_productions_notes_optional()}</FieldLabel>
            <Textarea value={f.state.value} onChange={(e) => f.handleChange(e.target.value)} placeholder={m.court_productions_order_reference_conditions_anything_the()} />
          </Field>
        )}
      </form.AppField>

      <DrawerFooter>
        <form.Subscribe selector={(state) => state.values.outcome}>
          {(outcome) => (
            <Button type="submit" disabled={!outcome || record.isPending}>
              {m.court_productions_record_outcome()}
            </Button>
          )}
        </form.Subscribe>
      </DrawerFooter>
    </form>
  )
}
