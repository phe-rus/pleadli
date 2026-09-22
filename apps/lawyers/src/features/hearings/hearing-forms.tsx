import { DateTimeField, momentOf } from '@/components/date-field'
import { SubmitButton } from '@/components/submit-button'
import { messageOf } from '@/lib/api'
import { toDatetimeLocal } from '@/lib/day'
import { useReportDirty } from '@/hooks/use-report-dirty'
import { useAppForm } from '@pleadli/forms-tables/forms'
import { DrawerFooter } from '@pleadli/ui/drawer'
import { t } from '@pleadli/ui/goey-toaster'
import { useAdjournHearing, useAttendHearing, useCancelHearing, useMissHearing, useRescheduleHearing, useScheduleHearing } from './queries'
import { purposes, reasons, responsibleParties } from './schema'

/** What is needed to move a hearing: its own fields, however they were read. */
export type HearingLike = { id: string; at: number; purpose: string; courtroom: string | null; note?: string | null }

type PanelProps = { onSuccess?: () => void; onDirtyChange?: (dirty: boolean) => void }

const purposeOptions = purposes.map((p) => ({ value: p.id, label: p.label }))
const formClass = 'flex flex-1 flex-col gap-4 overflow-y-auto p-4'

/** The next morning at nine, a sensible starting point for a new hearing. */
function defaultSlot() {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  d.setHours(9, 0, 0, 0)
  return toDatetimeLocal(d.getTime())
}

/** Listing a hearing, or moving one that has not yet been attended. */
export function HearingForm({ matterId, existing, onSuccess, onDirtyChange }: PanelProps & { matterId: string; existing?: HearingLike }) {
  const schedule = useScheduleHearing()
  const reschedule = useRescheduleHearing()
  const form = useAppForm({
    defaultValues: {
      at: existing ? toDatetimeLocal(existing.at) : defaultSlot(),
      purpose: existing?.purpose ?? 'mention',
      courtroom: existing?.courtroom ?? '',
      note: existing?.note ?? '',
    },
    validators: { onSubmit: ({ value }) => (momentOf(value.at) ? undefined : 'Choose the date and time of the hearing.') },
    onSubmit: async ({ value }) => {
      const input = { at: momentOf(value.at) ?? 0, purpose: value.purpose, courtroom: value.courtroom.trim() || null, note: value.note.trim() || null }
      try {
        if (existing) await reschedule.mutateAsync({ id: existing.id, input })
        else await schedule.mutateAsync({ matterId, input })
        t.success(existing ? 'Hearing moved' : 'Hearing listed')
        onSuccess?.()
      } catch (error) {
        t.error('Could not save the hearing', { description: messageOf(error) })
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
      <form.AppField name="at">{(f) => <DateTimeField label="Date and time" value={f.state.value} onChange={f.handleChange} />}</form.AppField>
      <form.AppField name="purpose">{(f) => <f.select label="Purpose" options={purposeOptions} />}</form.AppField>
      <form.AppField name="courtroom">{(f) => <f.input label="Courtroom (optional)" />}</form.AppField>
      <form.AppField name="note">{(f) => <f.textarea label="Note (optional)" rows={2} />}</form.AppField>
      <DrawerFooter>
        <SubmitButton form={form} label={existing ? 'Save changes' : 'List hearing'} />
      </DrawerFooter>
    </form>
  )
}

/** The advocate attended. What was done is required. */
export function AttendForm({ hearingId, onSuccess, onDirtyChange }: PanelProps & { hearingId: string }) {
  const hold = useAttendHearing()
  const form = useAppForm({
    defaultValues: { outcome: '' },
    validators: { onSubmit: ({ value }) => (value.outcome.trim() ? undefined : 'Record what was done at the hearing.') },
    onSubmit: async ({ value }) => {
      try {
        await hold.mutateAsync({ id: hearingId, outcome: value.outcome })
        t.success('Hearing marked attended')
        onSuccess?.()
      } catch (error) {
        t.error('Could not close the hearing', { description: messageOf(error) })
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
      <form.AppField name="outcome">{(f) => <f.textarea label="What was done" rows={5} placeholder="Applied for bail, cross-examined PW1, matter fixed for..." />}</form.AppField>
      <DrawerFooter>
        <form.AppForm>
          <form.submit label="Mark attended" />
        </form.AppForm>
      </DrawerFooter>
    </form>
  )
}

/** The hearing did not go ahead as planned. Why, and whose doing, are choices,
 * the same ones the court records; the next date is set here when it was fixed. */
export function AdjournForm({ hearing, defaults, onSuccess, onDirtyChange }: PanelProps & { hearing: { id: string; purpose: string; at: number }; defaults?: { reason: string; responsible: string } }) {
  const adjourn = useAdjournHearing()
  const form = useAppForm({
    defaultValues: { reason: defaults?.reason ?? '', responsible: defaults?.responsible ?? '', note: '', nextDate: '', nextPurpose: hearing.purpose },
    validators: {
      onSubmit: ({ value }) => {
        if (!value.reason) return 'Choose why the hearing was adjourned.'
        if (!value.responsible) return 'Choose who is responsible.'
        if (value.reason === 'other' && !value.note.trim()) return 'Say in words why the hearing was adjourned.'
        const next = momentOf(value.nextDate)
        if (next != null && next <= hearing.at) return 'The next date must be after this hearing.'
        return undefined
      },
    },
    onSubmit: async ({ value }) => {
      try {
        const result = await adjourn.mutateAsync({
          id: hearing.id,
          input: { reason: value.reason, responsible: value.responsible, note: value.note.trim() || null, nextDate: momentOf(value.nextDate), nextPurpose: momentOf(value.nextDate) ? value.nextPurpose : null },
        })
        t.success(result.nextHearing ? 'Adjourned, next hearing listed' : 'Adjourned, date to be fixed')
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
        {(f) => <DateTimeField label="Next date (optional)" value={f.state.value} onChange={f.handleChange} description="Leave empty if the court has not fixed the next date. The matter then stays on Today until it has one." />}
      </form.AppField>
      <form.Subscribe selector={(state) => state.values.nextDate}>
        {(next) => next && <form.AppField name="nextPurpose">{(f) => <f.select label="Purpose of the next hearing" options={purposeOptions} />}</form.AppField>}
      </form.Subscribe>
      <DrawerFooter>
        <form.AppForm>
          <form.submit label="Record adjournment" />
        </form.AppForm>
      </DrawerFooter>
    </form>
  )
}

/** The hearing will not be held at all (a listing withdrawn). */
export function CancelForm({ hearingId, onSuccess, onDirtyChange }: PanelProps & { hearingId: string }) {
  const cancel = useCancelHearing()
  const form = useAppForm({
    defaultValues: { note: '' },
    onSubmit: async ({ value }) => {
      try {
        await cancel.mutateAsync({ id: hearingId, note: value.note.trim() || null })
        t.success('Hearing cancelled')
        onSuccess?.()
      } catch (error) {
        t.error('Could not cancel the hearing', { description: messageOf(error) })
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
        <SubmitButton form={form} label="Cancel hearing" />
      </DrawerFooter>
    </form>
  )
}

/** The advocate was not at the hearing. It is recorded as it is, with a note. */
export function MissForm({ hearingId, onSuccess, onDirtyChange }: PanelProps & { hearingId: string }) {
  const miss = useMissHearing()
  const form = useAppForm({
    defaultValues: { note: '' },
    onSubmit: async ({ value }) => {
      try {
        await miss.mutateAsync({ id: hearingId, note: value.note.trim() || null })
        t.success('Recorded as missed')
        onSuccess?.()
      } catch (error) {
        t.error('Could not record it', { description: messageOf(error) })
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
        <SubmitButton form={form} label="Record as missed" />
      </DrawerFooter>
    </form>
  )
}
