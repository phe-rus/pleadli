import * as m from '@/paraglide/messages'
import { PersonPicker } from '@/components/person-picker'
import { AttachmentsField, entityTypes } from '@/features/attachments'
import { useReportDirty } from '@/hooks/use-report-dirty'
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
  onDirtyChange?: (dirty: boolean) => void
}

export function StationDiaryEntryForm({ entry, onSuccess, onDirtyChange }: StationDiaryEntryFormProps) {
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
      const submission = entry
        ? updateEntry.mutateAsync({ id: entry.id, input: value })
        : createEntry.mutateAsync(value)

      t.promise(submission, {
        loading: entry ? m["diary.saving_changes"]() : m["diary.saving_entry"](),
        success: entry ? m["diary.updated"]() : m["diary.logged"](),
        error: entry ? m["diary.update_failed"]() : m["diary.log_failed"](),
      })

      try {
        const result = await submission
        if (!entry) formApi.reset()
        onSuccess?.(result)
      } catch {
        // The promise toast above already surfaced the error.
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
        <form.AppField name="category">
          {(f) => <f.select label={m["common.category"]()} options={[...stationDiaryCategories]} />}
        </form.AppField>

        <form.AppField name="content">
          {(f) => (
            <Field data-invalid={f.state.meta.isTouched && !f.state.meta.isValid}>
              <FieldLabel>{m["shift_log.what_happened"]()}</FieldLabel>
              <RichTextInput
                value={f.state.value}
                onChange={f.handleChange}
                placeholder={m["diary.what_happened_placeholder"]()}
              />
            </Field>
          )}
        </form.AppField>

        <form.AppField name="personId">
          {(f) => (
            <Field>
              <FieldLabel>{m["common.related_person"]()}</FieldLabel>
              <PersonPicker value={f.state.value} onValueChange={f.handleChange} />
            </Field>
          )}
        </form.AppField>

        <AttachmentsField entityType={entityTypes.stationDiaryEntry} entityId={entry?.id} />
      </FieldGroup>

      <DrawerFooter>
        <form.AppForm>
          <form.submit label={entry ? m["common.save_changes"]() : m["diary.submit"]()} />
        </form.AppForm>
      </DrawerFooter>
    </form>
  )
}
