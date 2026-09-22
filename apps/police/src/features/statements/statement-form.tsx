import { OfficerPicker } from '@/features/officers'
import { PersonPicker } from '@/components/person-picker'
import { AttachmentsField, entityTypes } from '@/features/attachments'
import { casesOptions, type Case } from '@/features/cases'
import { useReportDirty } from '@/hooks/use-report-dirty'
import { RichTextInput } from '@pleadli/rich-text'
import { useAppForm } from '@pleadli/forms-tables/forms'
import { DrawerFooter } from '@pleadli/ui/drawer'
import { Field, FieldGroup, FieldLabel } from '@pleadli/ui/field'
import { Input } from '@pleadli/ui/input'
import { t } from '@pleadli/ui/goey-toaster'
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@pleadli/ui/select'
import { useSuspenseQuery } from '@tanstack/react-query'
import { createStatementSchema, type Statement } from './schema'
import { useCreateStatement, useUpdateStatement } from './queries'

export type StatementFormProps = {
  statement?: Statement
  onSuccess?: (statement: Statement) => void
  onDirtyChange?: (dirty: boolean) => void
}

function toDatetimeLocal(ms: number) {
  const d = new Date(ms)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function StatementForm({ statement, onSuccess, onDirtyChange }: StatementFormProps) {
  const createStatement = useCreateStatement()
  const updateStatement = useUpdateStatement()
  const { data: cases } = useSuspenseQuery(casesOptions(''))

  const form = useAppForm({
    defaultValues: {
      content: statement?.content ?? '',
      personId: statement?.personId ?? '',
      caseId: statement?.caseId ?? (null as string | null),
      officerId: statement?.officerId ?? (null as string | null),
      officerName: statement?.officerName ?? '',
      givenAt: statement ? toDatetimeLocal(statement.givenAt) : toDatetimeLocal(Date.now()),
    },
    validators: {
      onSubmit: ({ value }) => {
        const parsed = createStatementSchema.safeParse({
          ...value,
          givenAt: new Date(value.givenAt).getTime(),
        })
        return parsed.success ? undefined : parsed.error.issues[0]?.message
      },
    },
    onSubmit: async ({ value, formApi }) => {
      try {
        const input = { ...value, givenAt: new Date(value.givenAt).getTime() }
        const result = statement
          ? await updateStatement.mutateAsync({ id: statement.id, input })
          : await createStatement.mutateAsync(input)
        t.success(statement ? 'Statement updated' : 'Statement recorded')
        if (!statement) formApi.reset()
        onSuccess?.(result)
      } catch {
        t.error(statement ? 'Could not update statement' : 'Could not record statement', {
          description: 'Please try again.',
        })
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
      <FieldGroup>
        <form.AppField name="personId">
          {(f) => (
            <Field>
              <FieldLabel>Given by</FieldLabel>
              <PersonPicker value={f.state.value || null} onValueChange={(id) => f.handleChange(id ?? '')} />
            </Field>
          )}
        </form.AppField>

        <form.AppField name="content">
          {(f) => (
            <Field data-invalid={f.state.meta.isTouched && !f.state.meta.isValid}>
              <FieldLabel>Statement</FieldLabel>
              <RichTextInput value={f.state.value} onChange={f.handleChange} placeholder="What they said…" />
            </Field>
          )}
        </form.AppField>

        <div className="grid grid-cols-2 gap-3">
          <form.AppField name="officerId">
            {(f) => <OfficerPicker label="Taken by (officer)" value={f.state.value} onValueChange={f.handleChange} />}
          </form.AppField>
          <form.Subscribe selector={(state) => state.values.officerId}>
            {(officerId) =>
              officerId ? null : (
                <>
                <form.AppField name="officerName">{(f) => <f.input label="Name" />}</form.AppField>
                </>
              )
            }
          </form.Subscribe>
          <form.AppField name="givenAt">
            {(f) => (
              <Field>
                <FieldLabel>When given</FieldLabel>
                <Input
                  type="datetime-local"
                  value={f.state.value}
                  onChange={(e) => f.handleChange(e.target.value)}
                />
              </Field>
            )}
          </form.AppField>
        </div>

        <form.AppField name="caseId">
          {(f) => (
            <Field>
              <FieldLabel>Related case (optional)</FieldLabel>
              <Select
                items={[{ value: '', label: 'None' }, ...cases.map((c: Case) => ({ value: c.id, label: c.reference }))]}
                value={f.state.value ?? ''}
                onValueChange={(value) => f.handleChange(value || null)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="None" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="">None</SelectItem>
                    {cases.map((c: Case) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.reference}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
          )}
        </form.AppField>

        <AttachmentsField entityType={entityTypes.statement} entityId={statement?.id} />
      </FieldGroup>

      <DrawerFooter>
        <form.AppForm>
          <form.submit label={statement ? 'Save changes' : 'Record statement'} />
        </form.AppForm>
      </DrawerFooter>
    </form>
  )
}
