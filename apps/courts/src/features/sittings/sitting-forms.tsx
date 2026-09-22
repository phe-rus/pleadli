import { DateTimeField, momentOf } from '@/components/date-field'
import { SubmitButton } from '@/components/submit-button'
import { messageOf } from '@/lib/api'
import { toDatetimeLocal } from '@/lib/day'
import { useReportDirty } from '@/hooks/use-report-dirty'
import { useAppForm } from '@pleadli/forms-tables/forms'
import { DrawerFooter } from '@pleadli/ui/drawer'
import { t } from '@pleadli/ui/goey-toaster'
import { useAdjournSitting, useCancelSitting, useHoldSitting, useRescheduleSitting, useScheduleSitting } from './queries'
import { purposes, reasons, responsibleParties } from './schema'

/** What is needed to move a sitting: its own fields, however they were read. */
export type SittingLike = { id: string; scheduledAt: number; purpose: string; courtroom: string | null; note?: string | null }

type PanelProps = { onSuccess?: () => void; onDirtyChange?: (dirty: boolean) => void }

const purposeOptions = purposes.map((p) => ({ value: p.id, label: p.label }))
const formClass = 'flex flex-1 flex-col gap-4 overflow-y-auto p-4'

/** The next working morning at nine, a sensible starting point for a new sitting. */
function defaultSlot() {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  d.setHours(9, 0, 0, 0)
  return toDatetimeLocal(d.getTime())
}

/** Scheduling a sitting, or moving one that has not yet been held. */
export function SittingForm({ caseId, existing, onSuccess, onDirtyChange }: PanelProps & { caseId: string; existing?: SittingLike }) {
  const schedule = useScheduleSitting()
  const reschedule = useRescheduleSitting()
  const form = useAppForm({
    defaultValues: {
      scheduledAt: existing ? toDatetimeLocal(existing.scheduledAt) : defaultSlot(),
      purpose: existing?.purpose ?? 'mention',
      courtroom: existing?.courtroom ?? '',
      note: existing?.note ?? '',
    },
    validators: { onSubmit: ({ value }) => (momentOf(value.scheduledAt) ? undefined : 'Choose the date and time of the sitting.') },
    onSubmit: async ({ value }) => {
      const input = { scheduledAt: momentOf(value.scheduledAt) ?? 0, purpose: value.purpose, courtroom: value.courtroom.trim() || null, note: value.note.trim() || null }
      try {
        if (existing) await reschedule.mutateAsync({ id: existing.id, input })
        else await schedule.mutateAsync({ caseId, input })
        t.success(existing ? 'Sitting moved' : 'Sitting scheduled')
        onSuccess?.()
      } catch (error) {
        t.error('Could not save the sitting', { description: messageOf(error) })
      }
    },
  })
  useReportDirty(form, onDirtyChange)

  return (
    <form
      className={formClass}
      onSubmit={(event) => {
        event.preventDefault()
        void form.handleSubmit()
      }}
    >
      <form.AppField name="scheduledAt">{(f) => <DateTimeField label="Date and time" value={f.state.value} onChange={f.handleChange} />}</form.AppField>
      <form.AppField name="purpose">{(f) => <f.select label="Purpose" options={purposeOptions} />}</form.AppField>
      <form.AppField name="courtroom">{(f) => <f.input label="Courtroom (optional)" />}</form.AppField>
      <form.AppField name="note">{(f) => <f.textarea label="Note (optional)" rows={2} />}</form.AppField>
      <DrawerFooter>
        <SubmitButton form={form} label={existing ? 'Save changes' : 'Schedule sitting'} />
      </DrawerFooter>
    </form>
  )
}

/** The sitting took place. What was done is required. */
export function HoldForm({ sittingId, onSuccess, onDirtyChange }: PanelProps & { sittingId: string }) {
  const hold = useHoldSitting()
  const form = useAppForm({
    defaultValues: { outcome: '' },
    validators: { onSubmit: ({ value }) => (value.outcome.trim() ? undefined : 'Record what was done at the sitting.') },
    onSubmit: async ({ value }) => {
      try {
        await hold.mutateAsync({ id: sittingId, outcome: value.outcome })
        t.success('Sitting closed as held')
        onSuccess?.()
      } catch (error) {
        t.error('Could not close the sitting', { description: messageOf(error) })
      }
    },
  })
  useReportDirty(form, onDirtyChange)

  return (
    <form
      className={formClass}
      onSubmit={(event) => {
        event.preventDefault()
        void form.handleSubmit()
      }}
    >
      <form.AppField name="outcome">{(f) => <f.textarea label="What was done" rows={5} placeholder="Plea taken, evidence heard, ruling delivered, matter fixed for..." />}</form.AppField>
      <DrawerFooter>
        <form.AppForm>
          <form.submit label="Close as held" />
        </form.AppForm>
      </DrawerFooter>
    </form>
  )
}

/** The sitting did not go ahead as planned. Why, and whose doing, are choices;
 * the next date is set here when the court fixed it. */
export function AdjournForm({ sitting, defaults, onSuccess, onDirtyChange }: PanelProps & { sitting: { id: string; purpose: string; scheduledAt: number }; defaults?: { reason: string; responsible: string } }) {
  const adjourn = useAdjournSitting()
  const form = useAppForm({
    defaultValues: { reason: defaults?.reason ?? '', responsible: defaults?.responsible ?? '', note: '', nextDate: '', nextPurpose: sitting.purpose },
    validators: {
      onSubmit: ({ value }) => {
        if (!value.reason) return 'Choose why the sitting was adjourned.'
        if (!value.responsible) return 'Choose who is responsible.'
        if (value.reason === 'other' && !value.note.trim()) return 'Say in words why the sitting was adjourned.'
        const next = momentOf(value.nextDate)
        if (next != null && next <= sitting.scheduledAt) return 'The next date must be after this sitting.'
        return undefined
      },
    },
    onSubmit: async ({ value }) => {
      try {
        const result = await adjourn.mutateAsync({
          id: sitting.id,
          input: { reason: value.reason, responsible: value.responsible, note: value.note.trim() || null, nextDate: momentOf(value.nextDate), nextPurpose: momentOf(value.nextDate) ? value.nextPurpose : null },
        })
        t.success(result.nextSitting ? 'Adjourned, next sitting scheduled' : 'Adjourned, date to be fixed')
        onSuccess?.()
      } catch (error) {
        t.error('Could not record the adjournment', { description: messageOf(error) })
      }
    },
  })
  useReportDirty(form, onDirtyChange)

  return (
    <form
      className={formClass}
      onSubmit={(event) => {
        event.preventDefault()
        void form.handleSubmit()
      }}
    >
      <form.AppField name="reason">{(f) => <f.select label="Why was it adjourned?" options={reasons.map((r) => ({ value: r.id, label: r.label }))} />}</form.AppField>
      <form.AppField name="responsible">{(f) => <f.select label="Who is responsible?" options={responsibleParties.map((r) => ({ value: r.id, label: r.label }))} />}</form.AppField>
      <form.AppField name="note">{(f) => <f.textarea label="In words (required for Other)" rows={2} />}</form.AppField>
      <form.AppField name="nextDate">
        {(f) => <DateTimeField label="Next date (optional)" value={f.state.value} onChange={f.handleChange} description="Leave empty if the court has not fixed the next date. The case then stays on Today until it has one." />}
      </form.AppField>
      <form.Subscribe selector={(state) => state.values.nextDate}>
        {(next) => next && <form.AppField name="nextPurpose">{(f) => <f.select label="Purpose of the next sitting" options={purposeOptions} />}</form.AppField>}
      </form.Subscribe>
      <DrawerFooter>
        <form.AppForm>
          <form.submit label="Record adjournment" />
        </form.AppForm>
      </DrawerFooter>
    </form>
  )
}

/** The sitting will not be held at all (a listing withdrawn, the officer away). */
export function CancelForm({ sittingId, onSuccess, onDirtyChange }: PanelProps & { sittingId: string }) {
  const cancel = useCancelSitting()
  const form = useAppForm({
    defaultValues: { note: '' },
    onSubmit: async ({ value }) => {
      try {
        await cancel.mutateAsync({ id: sittingId, note: value.note.trim() || null })
        t.success('Sitting cancelled')
        onSuccess?.()
      } catch (error) {
        t.error('Could not cancel the sitting', { description: messageOf(error) })
      }
    },
  })
  useReportDirty(form, onDirtyChange)

  return (
    <form
      className={formClass}
      onSubmit={(event) => {
        event.preventDefault()
        void form.handleSubmit()
      }}
    >
      <form.AppField name="note">{(f) => <f.textarea label="Why (optional)" rows={3} />}</form.AppField>
      <DrawerFooter>
        <SubmitButton form={form} label="Cancel sitting" />
      </DrawerFooter>
    </form>
  )
}
