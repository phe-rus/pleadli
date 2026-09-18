import { useReportDirty } from '@/hooks/use-report-dirty'
import { RichTextInput } from '@pleadli/rich-text'
import { useAppForm } from '@pleadli/forms-tables/forms'
import { DrawerFooter } from '@pleadli/ui/drawer'
import { Field, FieldLabel } from '@pleadli/ui/field'
import { t } from '@pleadli/ui/goey-toaster'
import { useCreateReviewNote } from './queries'
import { createReviewNoteSchema, type ReviewNote } from './schema'

export type ReviewNoteFormProps = {
  prosecutionFileId: string
  onSuccess?: (note: ReviewNote) => void
  onDirtyChange?: (dirty: boolean) => void
}

/**
 * Review & Legal Observations (docs/dpp/PRODUCT.md) — the reviewing work
 * itself, distinct from a formal Decision. Never changes the file's
 * status.
 */
export function ReviewNoteForm({ prosecutionFileId, onSuccess, onDirtyChange }: ReviewNoteFormProps) {
  const createNote = useCreateReviewNote()

  const form = useAppForm({
    defaultValues: {
      author: '',
      note: '',
    },
    validators: {
      onSubmit: ({ value }) => {
        const parsed = createReviewNoteSchema.safeParse({ ...value, prosecutionFileId, statementId: null, evidenceItemId: null })
        return parsed.success ? undefined : parsed.error.issues[0]?.message
      },
    },
    onSubmit: async ({ value, formApi }) => {
      try {
        const result = await createNote.mutateAsync({ ...value, prosecutionFileId, statementId: null, evidenceItemId: null })
        t.success('Observation recorded')
        formApi.reset()
        onSuccess?.(result)
      } catch {
        t.error('Could not record observation', { description: 'Please try again.' })
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
      <form.AppField name="author">{(f) => <f.input label="Author (optional)" placeholder="Name" />}</form.AppField>

      <form.AppField name="note">
        {(f) => (
          <Field>
            <FieldLabel>Observation</FieldLabel>
            <RichTextInput value={f.state.value} onChange={f.handleChange} placeholder="What did you notice while reviewing this file?" />
          </Field>
        )}
      </form.AppField>

      <DrawerFooter>
        <form.AppForm>
          <form.submit label="Add observation" />
        </form.AppForm>
      </DrawerFooter>
    </form>
  )
}
