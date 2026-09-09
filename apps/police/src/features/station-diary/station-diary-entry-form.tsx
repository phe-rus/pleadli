import { PersonPicker } from '@/components/person-picker'
import { RichTextInput } from '@pleadli/rich-text'
import { useAppForm } from '@pleadli/forms-tables/forms'
import { DrawerFooter } from '@pleadli/ui/drawer'
import { Field, FieldGroup, FieldLabel } from '@pleadli/ui/field'
import { t } from '@pleadli/ui/goey-toaster'
import { createStationDiaryEntrySchema, stationDiaryCategories, type StationDiaryEntry } from './schema'
import { useCreateStationDiaryEntry, useUpdateStationDiaryEntry } from './queries'

export type StationDiaryEntryFormProps = {
  /** When provided, the form edits this entry instead of creating a new one. */
  entry?: StationDiaryEntry
  onSuccess?: (entry: StationDiaryEntry) => void
}

export function StationDiaryEntryForm({ entry, onSuccess }: StationDiaryEntryFormProps) {
  const createEntry = useCreateStationDiaryEntry()
  const updateEntry = useUpdateStationDiaryEntry()

  const form = useAppForm({
    defaultValues: {
      category: entry?.category ?? '',
      content: entry?.content ?? '',
      personId: entry?.personId ?? (null as string | null),
    },
    validators: {
      onSubmit: createStationDiaryEntrySchema,
    },
    onSubmit: async ({ value, formApi }) => {
      try {
        const result = entry
          ? await updateEntry.mutateAsync({ id: entry.id, input: value })
          : await createEntry.mutateAsync(value)
        t.success(entry ? 'Entry updated' : 'Entry logged')
        if (!entry) formApi.reset()
        onSuccess?.(result)
      } catch {
        t.error(entry ? 'Could not update entry' : 'Could not log entry', {
          description: 'Please try again.',
        })
      }
    },
  })

  return (
    <form
      className="flex flex-1 flex-col gap-4 overflow-y-auto p-4"
      onSubmit={(event) => {
        event.preventDefault()
        form.handleSubmit()
      }}
    >
      <FieldGroup>
        <form.AppField name="category">
          {(f) => <f.select label="Category" options={[...stationDiaryCategories]} />}
        </form.AppField>

        <form.AppField name="content">
          {(f) => (
            <Field data-invalid={f.state.meta.isTouched && !f.state.meta.isValid}>
              <FieldLabel>What happened</FieldLabel>
              <RichTextInput
                value={f.state.value}
                onChange={f.handleChange}
                placeholder="What happened…"
              />
            </Field>
          )}
        </form.AppField>

        <form.AppField name="personId">
          {(f) => (
            <Field>
              <FieldLabel>Related person (optional)</FieldLabel>
              <PersonPicker value={f.state.value} onValueChange={f.handleChange} />
            </Field>
          )}
        </form.AppField>
      </FieldGroup>

      <DrawerFooter>
        <form.AppForm>
          <form.submit label={entry ? 'Save changes' : 'Log entry'} />
        </form.AppForm>
      </DrawerFooter>
    </form>
  )
}
