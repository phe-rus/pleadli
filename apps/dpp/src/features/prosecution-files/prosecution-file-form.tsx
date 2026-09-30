import { useReportDirty } from '@/hooks/use-report-dirty'
import { referenceExample, referenceLabel } from '@/lib/jurisdiction'
import { RichTextInput } from '@pleadli/rich-text'
import { useAppForm } from '@pleadli/forms-tables/forms'
import { DrawerFooter } from '@pleadli/ui/drawer'
import { Field, FieldDescription, FieldLabel } from '@pleadli/ui/field'
import { Input } from '@pleadli/ui/input'
import { t } from '@pleadli/ui/goey-toaster'
import { useCreateProsecutionFile } from './queries'
import { createProsecutionFileSchema, type ProsecutionFile } from './schema'
import * as m from '@/paraglide/messages'

export type ProsecutionFileFormProps = {
  onSuccess?: (file: ProsecutionFile) => void
  onDirtyChange?: (dirty: boolean) => void
}

function toDatetimeLocal(ms: number) {
  const d = new Date(ms)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/**
 * Creating a file also logs the initial intake referral (title,
 * police-side reference, and what accompanied it) in the same action —
 * docs/dpp/PRODUCT.md §Intake & Referrals: a referral "creates ... a
 * Prosecution File". A resubmission after "return for further
 * investigation" is a separate, later action on the file itself, not this
 * form (see features/referrals).
 */
export function ProsecutionFileForm({ onSuccess, onDirtyChange }: ProsecutionFileFormProps) {
  const createFile = useCreateProsecutionFile()

  const form = useAppForm({
    defaultValues: {
      odppRegistrationNumber: '',
      title: '',
      policeStation: '',
      policeReference: '',
      receivedAt: toDatetimeLocal(Date.now()),
      materialSummary: '',
      notes: '',
    },
    validators: {
      onSubmit: ({ value }) => {
        const parsed = createProsecutionFileSchema.safeParse({ ...value, receivedAt: new Date(value.receivedAt).getTime() })
        return parsed.success ? undefined : parsed.error.issues[0]?.message
      },
    },
    onSubmit: async ({ value, formApi }) => {
      try {
        const input = { ...value, receivedAt: new Date(value.receivedAt).getTime() }
        const result = await createFile.mutateAsync(input)
        t.success(m["file.form.opened"]())
        formApi.reset()
        onSuccess?.(result)
      } catch {
        t.error(m["file.form.open_failed"](), { description: m["common.try_again"]() })
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
      <form.AppField name="title">
        {(f) => <f.input label={m["file.form.title"]()} placeholder={m["file.form.title_placeholder"]()} />}
      </form.AppField>

      <div className="grid grid-cols-2 gap-3">
        <form.AppField name="odppRegistrationNumber">
          {(f) => (
            <Field>
              <FieldLabel>{referenceLabel('prosecution', m["file.form.odpp_number"])}</FieldLabel>
              <Input value={f.state.value} onChange={(e) => f.handleChange(e.target.value)} placeholder={m["file.form.odpp_number_placeholder"]()} />
              <FieldDescription>{m["file.form.odpp_number_hint"]()}</FieldDescription>
            </Field>
          )}
        </form.AppField>
        <form.AppField name="receivedAt">
          {(f) => (
            <Field>
              <FieldLabel>{m["file.form.received"]()}</FieldLabel>
              <Input type="datetime-local" value={f.state.value} onChange={(e) => f.handleChange(e.target.value)} />
            </Field>
          )}
        </form.AppField>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <form.AppField name="policeStation">{(f) => <f.input label={m["file.form.police_station_optional"]()} placeholder={m["file.form.police_station_placeholder"]()} />}</form.AppField>
        <form.AppField name="policeReference">
          {(f) => (
            <Field>
              <FieldLabel>{referenceLabel('police', m["file.form.police_reference"])}</FieldLabel>
              <Input value={f.state.value} onChange={(e) => f.handleChange(e.target.value)} placeholder={referenceExample('police', m["file.form.police_reference_placeholder"])} />
              <FieldDescription>{m["file.form.police_reference_hint"]()}</FieldDescription>
            </Field>
          )}
        </form.AppField>
      </div>

      <form.AppField name="materialSummary">
        {(f) => (
          <Field>
            <FieldLabel>{m["file.form.material_optional"]()}</FieldLabel>
            <RichTextInput
              value={f.state.value}
              onChange={f.handleChange}
              placeholder={m["file.form.material_placeholder"]()}
            />
          </Field>
        )}
      </form.AppField>

      <form.AppField name="notes">
        {(f) => (
          <Field>
            <FieldLabel>{m["common.notes_optional"]()}</FieldLabel>
            <RichTextInput value={f.state.value} onChange={f.handleChange} placeholder={m["common.notes_placeholder"]()} />
          </Field>
        )}
      </form.AppField>

      <DrawerFooter>
        <form.AppForm>
          <form.submit label={m["file.form.submit_open"]()} />
        </form.AppForm>
      </DrawerFooter>
    </form>
  )
}
