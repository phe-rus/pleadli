import { DateField } from '@/components/date-field'
import { SubmitButton } from '@/components/submit-button'
import { messageOf } from '@/lib/api'
import { fromDateInput, toIsoDay } from '@/lib/day'
import { useReportDirty } from '@/hooks/use-report-dirty'
import { useAppForm } from '@pleadli/forms-tables/forms'
import { DrawerFooter } from '@pleadli/ui/drawer'
import { t } from '@pleadli/ui/goey-toaster'
import { purposes } from '../sittings/schema'
import { useCreateOrder, useUpdateOrder } from './queries'
import { orderKinds, type Order } from './schema'

export type OrderFormProps = {
  caseId: string
  /** When the order follows a sitting (an adjournment order). */
  sittingId?: string | null
  kind?: string
  /** A draft being edited. */
  existing?: Order
  /** The accused people in the case, offered for a remand or release order. */
  accused?: readonly string[]
  onSuccess?: (order: Order) => void
  onDirtyChange?: (dirty: boolean) => void
}

/** The facts an order is made from. The wording is rendered from them when the
 * order is issued, so a draft can be incomplete and an issued order cannot. */
export function OrderForm({ caseId, sittingId = null, kind: initialKind, existing, accused = [], onSuccess, onDirtyChange }: OrderFormProps) {
  const create = useCreateOrder()
  const update = useUpdateOrder()
  const fields = existing?.fields

  const form = useAppForm({
    defaultValues: {
      kind: existing?.kind ?? initialKind ?? 'adjournment',
      title: existing?.kind === 'general' ? existing.title : '',
      accused: fields?.accused ?? accused[0] ?? '',
      prison: fields?.prison ?? '',
      remandUntil: fields?.remandUntil ? toIsoDay(fields.remandUntil) : '',
      nextDate: fields?.nextDate ? toIsoDay(fields.nextDate) : '',
      nextPurpose: fields?.nextPurpose ?? 'hearing',
      reason: fields?.reason ?? '',
      body: fields?.body ?? '',
    },
    onSubmit: async ({ value }) => {
      const orderFields = {
        accused: value.accused.trim() || null,
        prison: value.prison.trim() || null,
        remandUntil: fromDateInput(value.remandUntil),
        nextDate: fromDateInput(value.nextDate),
        nextPurpose: value.nextDate ? value.nextPurpose : null,
        reason: value.reason.trim() || null,
        body: value.body.trim() || null,
      }
      const title = value.kind === 'general' ? value.title.trim() || null : null
      try {
        const order = existing
          ? await update.mutateAsync({ id: existing.id, input: { title, fields: orderFields } })
          : await create.mutateAsync({ caseId, sittingId, kind: value.kind, title, fields: orderFields })
        t.success(existing ? 'Draft saved' : 'Draft order created')
        onSuccess?.(order)
      } catch (error) {
        t.error('Could not save the order', { description: messageOf(error) })
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
      {!existing && <form.AppField name="kind">{(f) => <f.select label="Kind of order" options={orderKinds.map((k) => ({ value: k.id, label: k.label }))} />}</form.AppField>}

      <form.Subscribe selector={(state) => state.values.kind}>
        {(kind) => (
          <>
            <p className="text-muted-foreground">{orderKinds.find((k) => k.id === kind)?.about}</p>

            {kind === 'general' && <form.AppField name="title">{(f) => <f.input label="Title of the order" placeholder="Directions" />}</form.AppField>}

            {(kind === 'remand' || kind === 'release') && <form.AppField name="accused">{(f) => <f.input label="Accused person" list="case-accused" />}</form.AppField>}
            {(kind === 'remand' || kind === 'release') && accused.length > 0 && (
              <datalist id="case-accused">
                {accused.map((name) => (
                  <option key={name} value={name} />
                ))}
              </datalist>
            )}

            {kind === 'remand' && (
              <>
                <form.AppField name="prison">{(f) => <f.input label="Held at" placeholder="The prison or remand home" />}</form.AppField>
                <form.AppField name="remandUntil">{(f) => <DateField label="Remanded until" value={f.state.value} onChange={f.handleChange} />}</form.AppField>
              </>
            )}

            {kind === 'release' && <form.AppField name="reason">{(f) => <f.input label="Reason for release" placeholder="Bail granted, acquitted, sentence served..." />}</form.AppField>}

            {kind === 'adjournment' && (
              <>
                <form.AppField name="nextDate">
                  {(f) => <DateField label="Adjourned to" value={f.state.value} onChange={f.handleChange} description="Leave empty if the date is still to be fixed." />}
                </form.AppField>
                <form.AppField name="nextPurpose">{(f) => <f.select label="For" options={purposes.map((p) => ({ value: p.id, label: p.label }))} />}</form.AppField>
                <form.AppField name="reason">{(f) => <f.input label="Reason (optional)" placeholder="A witness was absent" />}</form.AppField>
              </>
            )}

            {kind === 'general' && <form.AppField name="body">{(f) => <f.textarea label="Text of the order" rows={8} />}</form.AppField>}
          </>
        )}
      </form.Subscribe>

      <p className="text-muted-foreground">The wording is a working template, not the Judiciary&rsquo;s prescribed form. Check it before you rely on it.</p>

      <DrawerFooter>
        <SubmitButton form={form} label={existing ? 'Save draft' : 'Create draft'} />
      </DrawerFooter>
    </form>
  )
}

