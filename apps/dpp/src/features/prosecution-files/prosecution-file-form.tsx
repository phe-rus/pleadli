import { useReportDirty } from '@/hooks/use-report-dirty'
import { RichTextInput } from '@pleadli/rich-text'
import { useAppForm } from '@pleadli/forms-tables/forms'
import { DrawerFooter } from '@pleadli/ui/drawer'
import { Field, FieldDescription, FieldLabel } from '@pleadli/ui/field'
import { Input } from '@pleadli/ui/input'
import { t } from '@pleadli/ui/goey-toaster'
import { useCreateProsecutionFile } from './queries'
import { createProsecutionFileSchema, type ProsecutionFile } from './schema'

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
        t.success('File opened')
        formApi.reset()
        onSuccess?.(result)
      } catch {
        t.error('Could not open file', { description: 'Please try again.' })
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
        {(f) => <f.input label="Title" placeholder="e.g. State vs. Okello, theft of motor vehicle" />}
      </form.AppField>

      <div className="grid grid-cols-2 gap-3">
        <form.AppField name="odppRegistrationNumber">
          {(f) => (
            <Field>
              <FieldLabel>ODPP registration number (optional)</FieldLabel>
              <Input value={f.state.value} onChange={(e) => f.handleChange(e.target.value)} placeholder="Assign when known" />
              <FieldDescription>No standard format was confirmed in research. Enter as recorded.</FieldDescription>
            </Field>
          )}
        </form.AppField>
        <form.AppField name="receivedAt">
          {(f) => (
            <Field>
              <FieldLabel>Received</FieldLabel>
              <Input type="datetime-local" value={f.state.value} onChange={(e) => f.handleChange(e.target.value)} />
            </Field>
          )}
        </form.AppField>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <form.AppField name="policeStation">{(f) => <f.input label="Police station (optional)" placeholder="e.g. Jinja Police Station" />}</form.AppField>
        <form.AppField name="policeReference">
          {(f) => (
            <Field>
              <FieldLabel>Police reference (optional)</FieldLabel>
              <Input value={f.state.value} onChange={(e) => f.handleChange(e.target.value)} placeholder="e.g. JINJA CRB 314/2019" />
              <FieldDescription>Real UPF citation format: full station name + CRB + number/year.</FieldDescription>
            </Field>
          )}
        </form.AppField>
      </div>

      <form.AppField name="materialSummary">
        {(f) => (
          <Field>
            <FieldLabel>What accompanied the file (optional)</FieldLabel>
            <RichTextInput
              value={f.state.value}
              onChange={f.handleChange}
              placeholder="e.g. Charge sheet (draft), witness statements, arresting officer statement, exhibit photos"
            />
          </Field>
        )}
      </form.AppField>

      <form.AppField name="notes">
        {(f) => (
          <Field>
            <FieldLabel>Notes (optional)</FieldLabel>
            <RichTextInput value={f.state.value} onChange={f.handleChange} placeholder="Notes…" />
          </Field>
        )}
      </form.AppField>

      <DrawerFooter>
        <form.AppForm>
          <form.submit label="Open file" />
        </form.AppForm>
      </DrawerFooter>
    </form>
  )
}
