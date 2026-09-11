import { useReportDirty } from '@/hooks/use-report-dirty'
import { RichTextInput } from '@pleadli/rich-text'
import { useAppForm } from '@pleadli/forms-tables/forms'
import { DrawerFooter } from '@pleadli/ui/drawer'
import { Field, FieldDescription, FieldLabel } from '@pleadli/ui/field'
import { Input } from '@pleadli/ui/input'
import { t } from '@pleadli/ui/goey-toaster'
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@pleadli/ui/select'
import { Switch } from '@pleadli/ui/switch'
import { useCreatePrisoner } from './queries'
import { admissionInstrumentTypes, createPrisonerSchema, prisonerStatuses, type Prisoner } from './schema'

export type PrisonerFormProps = {
  onSuccess?: (prisoner: Prisoner) => void
  onDirtyChange?: (dirty: boolean) => void
}

function toDatetimeLocal(ms: number) {
  const d = new Date(ms)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/**
 * Admission (docs/prisons/PRODUCT.md §Admission) — requires a reference to
 * one of the four legal instruments Prisons Act s.58 names (commitment,
 * remand warrant, order of detention, warrant of conviction/committal).
 * First-class, same reasoning as DPP's Intake being pulled into its own
 * create action.
 */
export function PrisonerForm({ onSuccess, onDirtyChange }: PrisonerFormProps) {
  const createPrisoner = useCreatePrisoner()

  const form = useAppForm({
    defaultValues: {
      firstName: '',
      lastName: '',
      otherNames: '',
      nationalId: '',
      reference: '',
      status: 'unconvicted',
      admissionInstrumentType: '',
      admissionAuthority: '',
      admittedAt: toDatetimeLocal(Date.now()),
      highCourtOnlyOffence: false,
      notes: '',
    },
    validators: {
      onSubmit: ({ value }) => {
        const parsed = createPrisonerSchema.safeParse({ ...value, admittedAt: new Date(value.admittedAt).getTime() })
        return parsed.success ? undefined : parsed.error.issues[0]?.message
      },
    },
    onSubmit: async ({ value, formApi }) => {
      try {
        const input = { ...value, admittedAt: new Date(value.admittedAt).getTime() }
        const result = await createPrisoner.mutateAsync(input)
        t.success('Prisoner admitted')
        formApi.reset()
        onSuccess?.(result)
      } catch {
        t.error('Could not admit prisoner', { description: 'Please try again.' })
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
        <form.AppField name="firstName">{(f) => <f.input label="First name" />}</form.AppField>
        <form.AppField name="lastName">{(f) => <f.input label="Last name" />}</form.AppField>
      </div>

      <form.AppField name="otherNames">{(f) => <f.input label="Other names (optional)" />}</form.AppField>

      <div className="grid grid-cols-2 gap-3">
        <form.AppField name="nationalId">{(f) => <f.input label="National ID (optional)" />}</form.AppField>
        <form.AppField name="reference">
          {(f) => (
            <Field>
              <FieldLabel>Reference (optional)</FieldLabel>
              <Input value={f.state.value} onChange={(e) => f.handleChange(e.target.value)} />
              <FieldDescription>No standard prisoner-number format was confirmed in research.</FieldDescription>
            </Field>
          )}
        </form.AppField>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <form.AppField name="admissionInstrumentType">
          {(f) => (
            <Field>
              <FieldLabel>Admission instrument</FieldLabel>
              <Select
                items={admissionInstrumentTypes}
                value={f.state.value}
                onValueChange={(value) => f.handleChange(value ?? f.state.value)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select instrument" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {admissionInstrumentTypes.map((instrument) => (
                      <SelectItem key={instrument.value} value={instrument.value}>
                        {instrument.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
              <FieldDescription>Prisons Act s.58 — one of these must accompany every admission.</FieldDescription>
            </Field>
          )}
        </form.AppField>
        <form.AppField name="admittedAt">
          {(f) => (
            <Field>
              <FieldLabel>Admitted</FieldLabel>
              <Input type="datetime-local" value={f.state.value} onChange={(e) => f.handleChange(e.target.value)} />
            </Field>
          )}
        </form.AppField>
      </div>

      <form.AppField name="admissionAuthority">
        {(f) => <f.input label="Issuing court / authority (optional)" placeholder="e.g. Jinja Chief Magistrate's Court" />}
      </form.AppField>

      <div className="grid grid-cols-2 gap-3">
        <form.AppField name="status">
          {(f) => (
            <Field>
              <FieldLabel>Status</FieldLabel>
              <Select items={prisonerStatuses} value={f.state.value} onValueChange={(value) => f.handleChange(value ?? f.state.value)}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {prisonerStatuses.map((s) => (
                      <SelectItem key={s.value} value={s.value}>
                        {s.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
          )}
        </form.AppField>

        <form.AppField name="highCourtOnlyOffence">
          {(f) => (
            <Field orientation="horizontal" className="items-center pt-6">
              <Switch checked={f.state.value} onCheckedChange={f.handleChange} />
              <FieldLabel>Offence triable only by the High Court</FieldLabel>
            </Field>
          )}
        </form.AppField>
      </div>
      <FieldDescription>
        Sets the constitutional mandatory-bail threshold: 180 days if triable only by the High Court, 60 days otherwise
        (Art. 23(6)) — not the Prisons Act's own unreformed 120/360-day text.
      </FieldDescription>

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
          <form.submit label="Admit prisoner" />
        </form.AppForm>
      </DrawerFooter>
    </form>
  )
}
