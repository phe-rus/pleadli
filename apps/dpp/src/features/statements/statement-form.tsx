import { PersonPicker } from '@/components/person-picker'
import { useReportDirty } from '@/hooks/use-report-dirty'
import { RichTextInput } from '@pleadli/rich-text'
import { useAppForm } from '@pleadli/forms-tables/forms'
import { DrawerFooter } from '@pleadli/ui/drawer'
import { Field, FieldLabel } from '@pleadli/ui/field'
import { Input } from '@pleadli/ui/input'
import { t } from '@pleadli/ui/goey-toaster'
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@pleadli/ui/select'
import { useCreateStatement } from './queries'
import { createStatementSchema, statementRoles, type Statement } from './schema'

export type StatementFormProps = {
  prosecutionFileId: string
  onSuccess?: (statement: Statement) => void
  onDirtyChange?: (dirty: boolean) => void
}

function toDatetimeLocal(ms: number) {
  const d = new Date(ms)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/**
 * Records a statement received with the Police referral, as DPP's own
 * material (docs/dpp/PRODUCT.md §Police Material (received)) — not a live
 * link into Police's own statements table, see the Architectural boundary
 * section for why.
 */
export function StatementForm({ prosecutionFileId, onSuccess, onDirtyChange }: StatementFormProps) {
  const createStatement = useCreateStatement()

  const form = useAppForm({
    defaultValues: {
      personId: '',
      statementRole: '',
      content: '',
      givenAt: toDatetimeLocal(Date.now()),
      sourceNote: '',
    },
    validators: {
      onSubmit: ({ value }) => {
        const parsed = createStatementSchema.safeParse({ ...value, prosecutionFileId, givenAt: new Date(value.givenAt).getTime() })
        return parsed.success ? undefined : parsed.error.issues[0]?.message
      },
    },
    onSubmit: async ({ value, formApi }) => {
      try {
        const input = { ...value, prosecutionFileId, givenAt: new Date(value.givenAt).getTime() }
        const result = await createStatement.mutateAsync(input)
        t.success('Statement recorded')
        formApi.reset()
        onSuccess?.(result)
      } catch {
        t.error('Could not record statement', { description: 'Please try again.' })
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
      <form.AppField name="personId">
        {(f) => (
          <Field>
            <FieldLabel>Person</FieldLabel>
            <PersonPicker value={f.state.value || null} onValueChange={(id) => f.handleChange(id ?? '')} />
          </Field>
        )}
      </form.AppField>

      <div className="grid grid-cols-2 gap-3">
        <form.AppField name="statementRole">
          {(f) => (
            <Field>
              <FieldLabel>Statement role</FieldLabel>
              <Select items={statementRoles} value={f.state.value} onValueChange={(value) => f.handleChange(value ?? f.state.value)}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select role" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {statementRoles.map((r) => (
                      <SelectItem key={r.value} value={r.value}>
                        {r.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
          )}
        </form.AppField>
        <form.AppField name="givenAt">
          {(f) => (
            <Field>
              <FieldLabel>Given at</FieldLabel>
              <Input type="datetime-local" value={f.state.value} onChange={(e) => f.handleChange(e.target.value)} />
            </Field>
          )}
        </form.AppField>
      </div>

      <form.AppField name="content">
        {(f) => (
          <Field>
            <FieldLabel>Statement content</FieldLabel>
            <RichTextInput value={f.state.value} onChange={f.handleChange} placeholder="What the statement says…" />
          </Field>
        )}
      </form.AppField>

      <form.AppField name="sourceNote">
        {(f) => <f.input label="Source note (optional)" placeholder="e.g. as received in the Police file" />}
      </form.AppField>

      <DrawerFooter>
        <form.AppForm>
          <form.submit label="Add statement" />
        </form.AppForm>
      </DrawerFooter>
    </form>
  )
}
