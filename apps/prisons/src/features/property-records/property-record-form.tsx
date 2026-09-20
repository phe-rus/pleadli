import { useReportDirty } from '@/hooks/use-report-dirty'
import { useAppForm } from '@pleadli/forms-tables/forms'
import { DrawerFooter } from '@pleadli/ui/drawer'
import { Field, FieldLabel } from '@pleadli/ui/field'
import { Input } from '@pleadli/ui/input'
import { t } from '@pleadli/ui/goey-toaster'
import { useCreatePropertyRecord } from './queries'
import { createPropertyRecordSchema, type PropertyRecord } from './schema'
import { m } from '@/paraglide/messages'

export type PropertyRecordFormProps = {
  prisonerId: string
  onSuccess?: (record: PropertyRecord) => void
  onDirtyChange?: (dirty: boolean) => void
}

function toDatetimeLocal(ms: number) {
  const d = new Date(ms)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/**
 * Records property/effects placed in the officer in charge's custody at
 * admission (Prisons Act s.62/s.30(2)(a), docs/prisons/RESEARCH.md §11.1) —
 * a plain description, not a structured multi-field inventory, since no
 * further field structure is confirmed.
 */
export function PropertyRecordForm({ prisonerId, onSuccess, onDirtyChange }: PropertyRecordFormProps) {
  const createRecord = useCreatePropertyRecord()

  const form = useAppForm({
    defaultValues: {
      description: '',
      recordedAt: toDatetimeLocal(Date.now()),
    },
    validators: {
      onSubmit: ({ value }) => {
        const parsed = createPropertyRecordSchema.safeParse({
          ...value,
          prisonerId,
          recordedAt: new Date(value.recordedAt).getTime(),
        })
        return parsed.success ? undefined : parsed.error.issues[0]?.message
      },
    },
    onSubmit: async ({ value, formApi }) => {
      try {
        const input = { ...value, prisonerId, recordedAt: new Date(value.recordedAt).getTime() }
        const result = await createRecord.mutateAsync(input)
        t.success(m.property_records_property_record_added())
        formApi.reset()
        onSuccess?.(result)
      } catch {
        t.error(m.property_records_could_not_add_property_record(), { description: m.property_records_please_try_again() })
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
      <form.AppField name="description">
        {(f) => <f.input label={m.property_records_description()} placeholder={m.property_records_e_g_phone_wallet_with_ugx()} />}
      </form.AppField>

      <form.AppField name="recordedAt">
        {(f) => (
          <Field>
            <FieldLabel>{m.property_records_recorded_at()}</FieldLabel>
            <Input type="datetime-local" value={f.state.value} onChange={(e) => f.handleChange(e.target.value)} />
          </Field>
        )}
      </form.AppField>

      <DrawerFooter>
        <form.AppForm>
          <form.submit label={m.property_records_add_property_record()} />
        </form.AppForm>
      </DrawerFooter>
    </form>
  )
}
