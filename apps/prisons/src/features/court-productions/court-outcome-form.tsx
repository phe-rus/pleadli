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
        t.success('Outcome recorded', {
          description:
            result.followUp === 'discharge'
              ? 'The court order points at discharge. Open Discharge from the prisoner file.'
              : result.followUp === 'sentence'
                ? 'Now record the sentence from the warrant.'
                : undefined,
        })
        onSuccess?.(result)
      } catch (error) {
        t.error('Could not record the outcome', { description: error instanceof ApiError ? error.message : 'Please try again.' })
      }
    },
  })

  useReportDirty(form, onDirtyChange)

  return (
    <form
      className="flex flex-1 flex-col gap-4 overflow-y-auto p-4"
      onSubmit={(event) => {
        event.preventDefault()
        form.handleSubmit()
      }}
    >
      <form.AppField name="outcome">
        {(f) => (
          <Field>
            <FieldLabel>What did the court decide?</FieldLabel>
            <Select items={courtOutcomes} value={f.state.value} onValueChange={(value) => f.handleChange(value ?? f.state.value)}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Choose the outcome" />
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
                  <FieldLabel>Next court date</FieldLabel>
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
            <FieldLabel>Notes (optional)</FieldLabel>
            <Textarea value={f.state.value} onChange={(e) => f.handleChange(e.target.value)} placeholder="Order reference, conditions, anything the file should carry" />
          </Field>
        )}
      </form.AppField>

      <DrawerFooter>
        <form.Subscribe selector={(state) => state.values.outcome}>
          {(outcome) => (
            <Button type="submit" disabled={!outcome || record.isPending}>
              Record outcome
            </Button>
          )}
        </form.Subscribe>
      </DrawerFooter>
    </form>
  )
}
