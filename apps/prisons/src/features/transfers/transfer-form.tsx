import { useReportDirty } from '@/hooks/use-report-dirty'
import { RichTextInput } from '@pleadli/rich-text'
import { useAppForm } from '@pleadli/forms-tables/forms'
import { DrawerFooter } from '@pleadli/ui/drawer'
import { Field, FieldDescription, FieldLabel } from '@pleadli/ui/field'
import { Input } from '@pleadli/ui/input'
import { t } from '@pleadli/ui/goey-toaster'
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@pleadli/ui/select'
import { useCreateTransfer } from './queries'
import { createTransferSchema, transferDirections, type Transfer } from './schema'

export type TransferFormProps = {
  prisonerId: string
  onSuccess?: (transfer: Transfer) => void
  onDirtyChange?: (dirty: boolean) => void
}

function toDatetimeLocal(ms: number) {
  const d = new Date(ms)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/**
 * Records a transfer (docs/prisons/PRODUCT.md §Transfers) — a movement on
 * this same custody record, confirmed by the Prisons Act itself to never
 * be a new episode (RESEARCH.md §9, s.73(5)-(6)).
 */
export function TransferForm({ prisonerId, onSuccess, onDirtyChange }: TransferFormProps) {
  const createTransfer = useCreateTransfer()

  const form = useAppForm({
    defaultValues: {
      direction: '',
      otherPrisonName: '',
      transferredAt: toDatetimeLocal(Date.now()),
      orderingAuthority: '',
      notes: '',
    },
    validators: {
      onSubmit: ({ value }) => {
        const parsed = createTransferSchema.safeParse({ ...value, prisonerId, transferredAt: new Date(value.transferredAt).getTime() })
        return parsed.success ? undefined : parsed.error.issues[0]?.message
      },
    },
    onSubmit: async ({ value, formApi }) => {
      try {
        const input = { ...value, prisonerId, transferredAt: new Date(value.transferredAt).getTime() }
        const result = await createTransfer.mutateAsync(input)
        t.success('Transfer recorded')
        formApi.reset()
        onSuccess?.(result)
      } catch {
        t.error('Could not record transfer', { description: 'Please try again.' })
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
      <form.AppField name="direction">
        {(f) => (
          <Field>
            <FieldLabel>Direction</FieldLabel>
            <Select items={transferDirections} value={f.state.value} onValueChange={(value) => f.handleChange(value ?? f.state.value)}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select direction" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {transferDirections.map((d) => (
                    <SelectItem key={d.value} value={d.value}>
                      {d.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
            <FieldDescription>
              "Received back" is only for a prisoner this facility already has a record for — a new arrival goes through Admission.
            </FieldDescription>
          </Field>
        )}
      </form.AppField>

      <div className="grid grid-cols-2 gap-3">
        <form.AppField name="otherPrisonName">{(f) => <f.input label="Other prison (optional)" />}</form.AppField>
        <form.AppField name="transferredAt">
          {(f) => (
            <Field>
              <FieldLabel>Transferred at</FieldLabel>
              <Input type="datetime-local" value={f.state.value} onChange={(e) => f.handleChange(e.target.value)} />
            </Field>
          )}
        </form.AppField>
      </div>

      <form.AppField name="orderingAuthority">
        {(f) => <f.input label="Ordering authority (optional)" placeholder="e.g. Commissioner General" />}
      </form.AppField>

      <form.AppField name="notes">
        {(f) => (
          <Field>
            <FieldLabel>Notes (optional)</FieldLabel>
            <RichTextInput value={f.state.value} onChange={f.handleChange} placeholder="Notes…" />
          </Field>
        )}
      </form.AppField>

      <DrawerFooter>
        <form.AppForm>
          <form.submit label="Record transfer" />
        </form.AppForm>
      </DrawerFooter>
    </form>
  )
}
