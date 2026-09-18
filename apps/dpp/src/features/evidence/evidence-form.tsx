import { useReportDirty } from '@/hooks/use-report-dirty'
import { RichTextInput } from '@pleadli/rich-text'
import { useAppForm } from '@pleadli/forms-tables/forms'
import { DrawerFooter } from '@pleadli/ui/drawer'
import { Field, FieldLabel } from '@pleadli/ui/field'
import { t } from '@pleadli/ui/goey-toaster'
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@pleadli/ui/select'
import { useCreateEvidenceItem } from './queries'
import { createEvidenceItemSchema, evidenceCategories, type EvidenceItem } from './schema'

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
        t.success('Evidence item recorded')
        formApi.reset()
        onSuccess?.(result)
      } catch {
        t.error('Could not record evidence item', { description: 'Please try again.' })
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
            <FieldLabel>Category</FieldLabel>
            <Select items={evidenceCategories} value={f.state.value} onValueChange={(value) => f.handleChange(value ?? f.state.value)}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select category" />
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
            <FieldLabel>Description</FieldLabel>
            <RichTextInput value={f.state.value} onChange={f.handleChange} placeholder="What this item is…" />
          </Field>
        )}
      </form.AppField>

      <div className="grid grid-cols-2 gap-3">
        <form.AppField name="identificationMark">{(f) => <f.input label="Identification mark (optional)" />}</form.AppField>
        <form.AppField name="recoveredFromLocation">{(f) => <f.input label="Recovered from (optional)" />}</form.AppField>
      </div>

      <form.AppField name="sourceNote">
        {(f) => <f.input label="Source note (optional)" placeholder="e.g. as listed in the Police exhibit register" />}
      </form.AppField>

      <DrawerFooter>
        <form.AppForm>
          <form.submit label="Add evidence item" />
        </form.AppForm>
      </DrawerFooter>
    </form>
  )
}
