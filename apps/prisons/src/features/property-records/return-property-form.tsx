import { useReportDirty } from '@/hooks/use-report-dirty'
import { useAppForm } from '@pleadli/forms-tables/forms'
import { DrawerFooter } from '@pleadli/ui/drawer'
import { Field, FieldLabel } from '@pleadli/ui/field'
import { Input } from '@pleadli/ui/input'
import { t } from '@pleadli/ui/goey-toaster'
import { useReturnPropertyRecord } from './queries'
import { returnPropertyRecordSchema, type PropertyRecord } from './schema'

export type ReturnPropertyFormProps = {
  record: PropertyRecord
  onSuccess?: (record: PropertyRecord) => void
  onDirtyChange?: (dirty: boolean) => void
}

function toDatetimeLocal(ms: number) {
  const d = new Date(ms)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** Marks property returned to the prisoner at release/discharge (s.62(3)). */
export function ReturnPropertyForm({ record, onSuccess, onDirtyChange }: ReturnPropertyFormProps) {
  const returnRecord = useReturnPropertyRecord(record.prisonerId)

  const form = useAppForm({
    defaultValues: {
      returnedAt: toDatetimeLocal(Date.now()),
      returnedNote: '',
    },
    validators: {
      onSubmit: ({ value }) => {
        const parsed = returnPropertyRecordSchema.safeParse({ ...value, returnedAt: new Date(value.returnedAt).getTime() })
        return parsed.success ? undefined : parsed.error.issues[0]?.message
      },
    },
    onSubmit: async ({ value, formApi }) => {
      try {
        const input = { ...value, returnedAt: new Date(value.returnedAt).getTime() }
        const result = await returnRecord.mutateAsync({ id: record.id, input })
        t.success('Marked as returned')
        formApi.reset()
        onSuccess?.(result)
      } catch {
        t.error('Could not mark as returned', { description: 'Please try again.' })
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
      <form.AppField name="returnedAt">
        {(f) => (
          <Field>
            <FieldLabel>Returned at</FieldLabel>
            <Input type="datetime-local" value={f.state.value} onChange={(e) => f.handleChange(e.target.value)} />
          </Field>
        )}
      </form.AppField>

      <form.AppField name="returnedNote">{(f) => <f.input label="Note (optional)" placeholder="e.g. Handed to next of kin" />}</form.AppField>

      <DrawerFooter>
        <form.AppForm>
          <form.submit label="Mark returned" />
        </form.AppForm>
      </DrawerFooter>
    </form>
  )
}
