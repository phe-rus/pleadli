import { useReportDirty } from '@/hooks/use-report-dirty'
import { RichTextInput } from '@pleadli/rich-text'
import { useAppForm } from '@pleadli/forms-tables/forms'
import { DrawerFooter } from '@pleadli/ui/drawer'
import { Field, FieldLabel } from '@pleadli/ui/field'
import { Input } from '@pleadli/ui/input'
import { t } from '@pleadli/ui/goey-toaster'
import { useCreateResubmission } from './queries'
import { createResubmissionSchema, type Referral } from './schema'

export type ResubmissionFormProps = {
  prosecutionFileId: string
  onSuccess?: (referral: Referral) => void
  onDirtyChange?: (dirty: boolean) => void
}

function toDatetimeLocal(ms: number) {
  const d = new Date(ms)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/**
 * Logs a police resubmission against an already-open file — RESEARCH.md §3:
 * a file returned for further investigation gets resubmitted, it doesn't
 * become a new file.
 */
export function ResubmissionForm({ prosecutionFileId, onSuccess, onDirtyChange }: ResubmissionFormProps) {
  const createResubmission = useCreateResubmission()

  const form = useAppForm({
    defaultValues: {
      policeStation: '',
      policeReference: '',
      receivedAt: toDatetimeLocal(Date.now()),
      materialSummary: '',
      notes: '',
    },
    validators: {
      onSubmit: ({ value }) => {
        const parsed = createResubmissionSchema.safeParse({
          ...value,
          prosecutionFileId,
          receivedAt: new Date(value.receivedAt).getTime(),
        })
        return parsed.success ? undefined : parsed.error.issues[0]?.message
      },
    },
    onSubmit: async ({ value, formApi }) => {
      try {
        const input = { ...value, prosecutionFileId, receivedAt: new Date(value.receivedAt).getTime() }
        const result = await createResubmission.mutateAsync(input)
        t.success('Resubmission logged')
        formApi.reset()
        onSuccess?.(result)
      } catch {
        t.error('Could not log resubmission', { description: 'Please try again.' })
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
      <div className="grid grid-cols-2 gap-3">
        <form.AppField name="policeStation">{(f) => <f.input label="Police station (optional)" placeholder="e.g. Jinja Police Station" />}</form.AppField>
        <form.AppField name="policeReference">{(f) => <f.input label="Police reference (optional)" placeholder="e.g. JINJA CRB 314/2019" />}</form.AppField>
      </div>

      <form.AppField name="receivedAt">
        {(f) => (
          <Field>
            <FieldLabel>Received</FieldLabel>
            <Input type="datetime-local" value={f.state.value} onChange={(e) => f.handleChange(e.target.value)} />
          </Field>
        )}
      </form.AppField>

      <form.AppField name="materialSummary">
        {(f) => (
          <Field>
            <FieldLabel>What was provided (optional)</FieldLabel>
            <RichTextInput value={f.state.value} onChange={f.handleChange} placeholder="What was provided…" />
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
          <form.submit label="Log resubmission" />
        </form.AppForm>
      </DrawerFooter>
    </form>
  )
}
