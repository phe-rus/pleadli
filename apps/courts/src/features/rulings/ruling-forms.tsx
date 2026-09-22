import { DateField } from '@/components/date-field'
import { SubmitButton } from '@/components/submit-button'
import { messageOf } from '@/lib/api'
import { fromDateInput, toIsoDay } from '@/lib/day'
import { useReportDirty } from '@/hooks/use-report-dirty'
import { useAppForm } from '@pleadli/forms-tables/forms'
import { DrawerFooter } from '@pleadli/ui/drawer'
import { t } from '@pleadli/ui/goey-toaster'
import { useCreateRuling, useDeliverRuling } from './queries'
import { rulingKinds, type Ruling } from './schema'

/** Starting a ruling or a judgment. A judgment that is being reserved carries
 * the day it was reserved, so it stays in view until it is delivered. */
export function RulingCreateForm({ caseId, sittingId = null, kind = 'ruling', onSuccess, onDirtyChange }: { caseId: string; sittingId?: string | null; kind?: string; onSuccess?: (ruling: Ruling) => void; onDirtyChange?: (dirty: boolean) => void }) {
  const create = useCreateRuling()
  const form = useAppForm({
    defaultValues: { kind, title: '', reservedOn: '' },
    validators: { onSubmit: ({ value }) => (value.title.trim() ? undefined : 'Give the decision a title, for example the application it decides.') },
    onSubmit: async ({ value }) => {
      try {
        const ruling = await create.mutateAsync({ caseId, sittingId, kind: value.kind, title: value.title, reservedOn: fromDateInput(value.reservedOn) })
        t.success('Draft started')
        onSuccess?.(ruling)
      } catch (error) {
        t.error('Could not start the draft', { description: messageOf(error) })
      }
    },
  })
  useReportDirty(form, onDirtyChange)

  return (
    <form
      className="flex flex-1 flex-col gap-4 overflow-y-auto p-4"
      onSubmit={(event) => {
        event.preventDefault()
        void form.handleSubmit()
      }}
    >
      <form.AppField name="kind">{(f) => <f.select label="Kind" options={rulingKinds.map((k) => ({ value: k.id, label: k.label }))} />}</form.AppField>
      <form.AppField name="title">{(f) => <f.input label="Title" placeholder="Ruling on the bail application" />}</form.AppField>
      <form.AppField name="reservedOn">
        {(f) => <DateField label="Reserved on (optional)" value={f.state.value} onChange={f.handleChange} description="If the decision was reserved, the day it was. It stays on Today until it is delivered." />}
      </form.AppField>
      <DrawerFooter>
        <SubmitButton form={form} label="Start draft" />
      </DrawerFooter>
    </form>
  )
}

/** Delivering: the day the decision was given in court. It cannot be a day that
 * has not come, or before the day it was reserved. */
export function DeliverForm({ ruling, onSuccess }: { ruling: Ruling; onSuccess?: () => void }) {
  const deliver = useDeliverRuling()
  const form = useAppForm({
    defaultValues: { deliveredOn: toIsoDay(Date.now()) },
    validators: { onSubmit: ({ value }) => (fromDateInput(value.deliveredOn) ? undefined : 'Choose the day the decision was delivered.') },
    onSubmit: async ({ value }) => {
      try {
        await deliver.mutateAsync({ id: ruling.id, deliveredOn: fromDateInput(value.deliveredOn) ?? 0 })
        t.success('Delivered')
        onSuccess?.()
      } catch (error) {
        t.error('It cannot be delivered yet', { description: messageOf(error) })
      }
    },
  })

  return (
    <form
      className="flex flex-1 flex-col gap-4 overflow-y-auto p-4"
      onSubmit={(event) => {
        event.preventDefault()
        void form.handleSubmit()
      }}
    >
      <p>Delivering gives the decision a reference and freezes it. It can be printed, and replaced by a new decision, but never edited.</p>
      <form.AppField name="deliveredOn">{(f) => <DateField label="Delivered on" value={f.state.value} onChange={f.handleChange} />}</form.AppField>
      <DrawerFooter>
        <SubmitButton form={form} label="Deliver" />
      </DrawerFooter>
    </form>
  )
}
