import { useReportDirty } from '@/hooks/use-report-dirty'
import { RichTextInput } from '@pleadli/rich-text'
import { useAppForm } from '@pleadli/forms-tables/forms'
import { DrawerFooter } from '@pleadli/ui/drawer'
import { Field, FieldLabel } from '@pleadli/ui/field'
import { t } from '@pleadli/ui/goey-toaster'
import { useCreateReviewNote } from './queries'
import { createReviewNoteSchema, type ReviewNote } from './schema'
import * as m from '@/paraglide/messages'

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
        t.success(m["review_note.form.recorded"]())
        formApi.reset()
        onSuccess?.(result)
      } catch {
        t.error(m["review_note.form.record_failed"](), { description: m["common.try_again"]() })
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
      <form.AppField name="author">{(f) => <f.input label={m["review_note.form.author_optional"]()} placeholder={m["review_note.form.author_placeholder"]()} />}</form.AppField>

      <form.AppField name="note">
        {(f) => (
          <Field>
            <FieldLabel>{m["review_note.form.observation"]()}</FieldLabel>
            <RichTextInput value={f.state.value} onChange={f.handleChange} placeholder={m["review_note.form.observation_placeholder"]()} />
          </Field>
        )}
      </form.AppField>

      <DrawerFooter>
        <form.AppForm>
          <form.submit label={m["review_note.form.submit"]()} />
        </form.AppForm>
      </DrawerFooter>
    </form>
  )
}
