import { PersonPicker } from '@/components/person-picker'
import { useReportDirty } from '@/hooks/use-report-dirty'
import { RichTextInput } from '@pleadli/rich-text'
import { useAppForm } from '@pleadli/forms-tables/forms'
import { DrawerFooter } from '@pleadli/ui/drawer'
import { Field, FieldLabel } from '@pleadli/ui/field'
import { t } from '@pleadli/ui/goey-toaster'
import { useCreateCharge } from './queries'
import { createChargeSchema, type Charge } from './schema'
import * as m from '@/paraglide/messages'

export type ChargeFormProps = {
  prosecutionFileId: string
  onSuccess?: (charge: Charge) => void
  onDirtyChange?: (dirty: boolean) => void
}

/**
 * The proposed charge Police is putting forward (docs/dpp/PRODUCT.md
 * §Police Material (received)) — same shape as Police's own charge sheet,
 * since DPP reviews a proposal, it doesn't invent one.
 */
export function ChargeForm({ prosecutionFileId, onSuccess, onDirtyChange }: ChargeFormProps) {
  const createCharge = useCreateCharge()

  const form = useAppForm({
    defaultValues: {
      accusedPersonId: null as string | null,
      offence: '',
      statutorySection: '',
      particulars: '',
    },
    validators: {
      onSubmit: ({ value }) => {
        const parsed = createChargeSchema.safeParse({ ...value, prosecutionFileId })
        return parsed.success ? undefined : parsed.error.issues[0]?.message
      },
    },
    onSubmit: async ({ value, formApi }) => {
      try {
        const result = await createCharge.mutateAsync({ ...value, prosecutionFileId })
        t.success(m["charge.form.recorded"]())
        formApi.reset()
        onSuccess?.(result)
      } catch {
        t.error(m["charge.form.record_failed"](), { description: m["common.try_again"]() })
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
      <form.AppField name="accusedPersonId">
        {(f) => (
          <Field>
            <FieldLabel>{m["charge.form.accused_optional"]()}</FieldLabel>
            <PersonPicker value={f.state.value} onValueChange={f.handleChange} />
          </Field>
        )}
      </form.AppField>

      <div className="grid grid-cols-2 gap-3">
        <form.AppField name="offence">{(f) => <f.input label={m["charge.form.offence"]()} placeholder={m["charge.form.offence_placeholder"]()} />}</form.AppField>
        <form.AppField name="statutorySection">{(f) => <f.input label={m["charge.form.section_optional"]()} />}</form.AppField>
      </div>

      <form.AppField name="particulars">
        {(f) => (
          <Field>
            <FieldLabel>{m["charge.form.particulars_optional"]()}</FieldLabel>
            <RichTextInput value={f.state.value} onChange={f.handleChange} placeholder={m["charge.form.particulars_placeholder"]()} />
          </Field>
        )}
      </form.AppField>

      <DrawerFooter>
        <form.AppForm>
          <form.submit label={m["charge.form.submit"]()} />
        </form.AppForm>
      </DrawerFooter>
    </form>
  )
}
