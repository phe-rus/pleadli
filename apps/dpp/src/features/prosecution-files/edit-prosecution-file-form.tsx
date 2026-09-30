import { useReportDirty } from '@/hooks/use-report-dirty'
import { referenceLabel } from '@/lib/jurisdiction'
import { RichTextInput } from '@pleadli/rich-text'
import { useAppForm } from '@pleadli/forms-tables/forms'
import { DrawerFooter } from '@pleadli/ui/drawer'
import { Field, FieldLabel } from '@pleadli/ui/field'
import { t } from '@pleadli/ui/goey-toaster'
import { useUpdateProsecutionFile } from './queries'
import { updateProsecutionFileSchema, type ProsecutionFile } from './schema'
import * as m from '@/paraglide/messages'

export type EditProsecutionFileFormProps = {
  file: ProsecutionFile
  onSuccess?: (file: ProsecutionFile) => void
  onDirtyChange?: (dirty: boolean) => void
}

export function EditProsecutionFileForm({ file, onSuccess, onDirtyChange }: EditProsecutionFileFormProps) {
  const updateFile = useUpdateProsecutionFile()

  const form = useAppForm({
    defaultValues: {
      odppRegistrationNumber: file.odppRegistrationNumber ?? '',
      title: file.title,
      policeStation: file.policeStation ?? '',
      policeReference: file.policeReference ?? '',
      courtCaseNumber: file.courtCaseNumber ?? '',
      notes: file.notes ?? '',
    },
    validators: {
      onSubmit: ({ value }) => {
        const parsed = updateProsecutionFileSchema.safeParse(value)
        return parsed.success ? undefined : parsed.error.issues[0]?.message
      },
    },
    onSubmit: async ({ value }) => {
      try {
        const result = await updateFile.mutateAsync({ id: file.id, input: value })
        t.success(m["file.form.updated"]())
        onSuccess?.(result)
      } catch {
        t.error(m["file.form.update_failed"](), { description: m["common.try_again"]() })
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
      <form.AppField name="title">{(f) => <f.input label={m["file.form.title"]()} />}</form.AppField>

      <div className="grid grid-cols-2 gap-3">
        <form.AppField name="odppRegistrationNumber">{(f) => <f.input label={referenceLabel('prosecution', m["file.form.odpp_number"])} />}</form.AppField>
        <form.AppField name="courtCaseNumber">{(f) => <f.input label={referenceLabel('court', m["file.form.court_case_number"])} />}</form.AppField>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <form.AppField name="policeStation">{(f) => <f.input label={m["file.form.police_station"]()} />}</form.AppField>
        <form.AppField name="policeReference">{(f) => <f.input label={referenceLabel('police', m["file.form.police_reference"])} />}</form.AppField>
      </div>

      <form.AppField name="notes">
        {(f) => (
          <Field>
            <FieldLabel>{m["common.notes"]()}</FieldLabel>
            <RichTextInput value={f.state.value} onChange={f.handleChange} placeholder={m["common.notes_placeholder"]()} />
          </Field>
        )}
      </form.AppField>

      <DrawerFooter>
        <form.AppForm>
          <form.submit label={m["common.save_changes"]()} />
        </form.AppForm>
      </DrawerFooter>
    </form>
  )
}
