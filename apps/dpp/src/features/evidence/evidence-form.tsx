import { useReportDirty } from '@/hooks/use-report-dirty'
import { RichTextInput } from '@pleadli/rich-text'
import { useAppForm } from '@pleadli/forms-tables/forms'
import { DrawerFooter } from '@pleadli/ui/drawer'
import { Field, FieldLabel } from '@pleadli/ui/field'
import { t } from '@pleadli/ui/goey-toaster'
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@pleadli/ui/select'
import { useCreateEvidenceItem } from './queries'
import { createEvidenceItemSchema, evidenceCategories, type EvidenceItem } from './schema'
import * as m from '@/paraglide/messages'

export type EvidenceFormProps = {
  prosecutionFileId: string
  onSuccess?: (item: EvidenceItem) => void
  onDirtyChange?: (dirty: boolean) => void
}

/**
 * Records what Police says exists (docs/dpp/PRODUCT.md §Police Material
 * (received)) — DPP's own description, not independent physical
 * chain-of-custody the way Police's own Exhibits domain tracks it.
 */
export function EvidenceForm({ prosecutionFileId, onSuccess, onDirtyChange }: EvidenceFormProps) {
  const createItem = useCreateEvidenceItem()

  const form = useAppForm({
    defaultValues: {
      category: '',
      description: '',
      identificationMark: '',
      recoveredFromLocation: '',
      sourceNote: '',
    },
    validators: {
      onSubmit: ({ value }) => {
        const parsed = createEvidenceItemSchema.safeParse({ ...value, prosecutionFileId })
        return parsed.success ? undefined : parsed.error.issues[0]?.message
      },
    },
    onSubmit: async ({ value, formApi }) => {
      try {
        const result = await createItem.mutateAsync({ ...value, prosecutionFileId })
        t.success(m["evidence.form.recorded"]())
        formApi.reset()
        onSuccess?.(result)
      } catch {
        t.error(m["evidence.form.record_failed"](), { description: m["common.try_again"]() })
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
      <form.AppField name="category">
        {(f) => (
          <Field>
            <FieldLabel>{m["evidence.form.category"]()}</FieldLabel>
            <Select items={evidenceCategories} value={f.state.value} onValueChange={(value) => f.handleChange(value ?? f.state.value)}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder={m["evidence.form.category_placeholder"]()} />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {evidenceCategories.map((c) => (
                    <SelectItem key={c.value} value={c.value}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>
        )}
      </form.AppField>

      <form.AppField name="description">
        {(f) => (
          <Field>
            <FieldLabel>{m["evidence.form.description"]()}</FieldLabel>
            <RichTextInput value={f.state.value} onChange={f.handleChange} placeholder={m["evidence.form.description_placeholder"]()} />
          </Field>
        )}
      </form.AppField>

      <div className="grid grid-cols-2 gap-3">
        <form.AppField name="identificationMark">{(f) => <f.input label={m["evidence.form.mark_optional"]()} />}</form.AppField>
        <form.AppField name="recoveredFromLocation">{(f) => <f.input label={m["evidence.form.recovered_optional"]()} />}</form.AppField>
      </div>

      <form.AppField name="sourceNote">
        {(f) => <f.input label={m["common.source_note_optional"]()} placeholder={m["evidence.form.source_placeholder"]()} />}
      </form.AppField>

      <DrawerFooter>
        <form.AppForm>
          <form.submit label={m["evidence.form.submit"]()} />
        </form.AppForm>
      </DrawerFooter>
    </form>
  )
}
