import { useReportDirty } from '@/hooks/use-report-dirty'
import { RichTextInput } from '@pleadli/rich-text'
import { useAppForm } from '@pleadli/forms-tables/forms'
import { useStore } from '@tanstack/react-form'
import { DrawerFooter } from '@pleadli/ui/drawer'
import { Field, FieldDescription, FieldLabel } from '@pleadli/ui/field'
import { Input } from '@pleadli/ui/input'
import { t } from '@pleadli/ui/goey-toaster'
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@pleadli/ui/select'
import { Switch } from '@pleadli/ui/switch'
import { useUpdatePrisoner } from './queries'
import {
  educationLevels,
  nationalities,
  pendingDocumentTypes,
  prisonerSexes,
  prisonerStatuses,
  updatePrisonerSchema,
  type Prisoner,
} from './schema'

export type EditPrisonerFormProps = {
  prisoner: Prisoner
  onSuccess?: (prisoner: Prisoner) => void
  onDirtyChange?: (dirty: boolean) => void
}

function toDateLocal(ms: number | null) {
  if (!ms) return ''
  const d = new Date(ms)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function EditPrisonerForm({ prisoner, onSuccess, onDirtyChange }: EditPrisonerFormProps) {
  const updatePrisoner = useUpdatePrisoner()

  const form = useAppForm({
    defaultValues: {
      firstName: prisoner.firstName,
      lastName: prisoner.lastName,
      otherNames: prisoner.otherNames ?? '',
      nationalId: prisoner.nationalId ?? '',
      reference: prisoner.reference ?? '',
      status: prisoner.status,
      highCourtOnlyOffence: prisoner.highCourtOnlyOffence,
      currentLocation: prisoner.currentLocation ?? '',
      dateOfBirth: toDateLocal(prisoner.dateOfBirth),
      sex: prisoner.sex ?? '',
      educationLevel: prisoner.educationLevel ?? '',
      nationality: prisoner.nationality ?? '',
      offence: prisoner.offence ?? '',
      documentsPending: prisoner.documentsPending,
      pendingDocumentType: prisoner.pendingDocumentType ?? '',
      notes: prisoner.notes ?? '',
    },
    validators: {
      onSubmit: ({ value }) => {
        if (value.documentsPending && !value.pendingDocumentType) return 'Select which document is pending.'
        const parsed = updatePrisonerSchema.safeParse({
          ...value,
          dateOfBirth: value.dateOfBirth ? new Date(value.dateOfBirth).getTime() : null,
        })
        return parsed.success ? undefined : parsed.error.issues[0]?.message
      },
    },
    onSubmit: async ({ value }) => {
      try {
        const input = {
          ...value,
          dateOfBirth: value.dateOfBirth ? new Date(value.dateOfBirth).getTime() : null,
        }
        const result = await updatePrisoner.mutateAsync({ id: prisoner.id, input })
        t.success('Prisoner details updated')
        onSuccess?.(result)
      } catch {
        t.error('Could not update prisoner details', { description: 'Please try again.' })
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

      <form.AppField name="otherNames">{(f) => <f.input label="Other names" />}</form.AppField>

      <div className="grid grid-cols-2 gap-3">
        <form.AppField name="nationalId">{(f) => <f.input label="National ID" />}</form.AppField>
        <form.AppField name="reference">{(f) => <f.input label="Reference" />}</form.AppField>
      </div>

      <form.AppField name="currentLocation">
        {(f) => <f.input label="Current location (optional)" placeholder="e.g. Ward 3, whatever this facility calls its own areas" />}
      </form.AppField>

      <div className="grid grid-cols-2 gap-3">
        <form.AppField name="dateOfBirth">
          {(f) => (
            <Field>
              <FieldLabel>Date of birth</FieldLabel>
              <Input type="date" value={f.state.value} onChange={(e) => f.handleChange(e.target.value)} />
            </Field>
          )}
        </form.AppField>
        <form.AppField name="sex">
          {(f) => (
            <Field>
              <FieldLabel>Sex</FieldLabel>
              <Select items={prisonerSexes} value={f.state.value} onValueChange={(value) => f.handleChange(value ?? f.state.value)}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select sex" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {prisonerSexes.map((s) => (
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
      </div>

      <div className="grid grid-cols-2 gap-3">
        <form.AppField name="educationLevel">
          {(f) => (
            <Field>
              <FieldLabel>Education level</FieldLabel>
              <Select items={educationLevels} value={f.state.value} onValueChange={(value) => f.handleChange(value ?? f.state.value)}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select level" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {educationLevels.map((s) => (
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
        <form.AppField name="nationality">
          {(f) => (
            <Field>
              <FieldLabel>Nationality</FieldLabel>
              <Select items={nationalities} value={f.state.value} onValueChange={(value) => f.handleChange(value ?? f.state.value)}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select nationality" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {nationalities.map((s) => (
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
      </div>

      <div className="grid grid-cols-2 gap-3">
        <form.AppField name="offence">
          {(f) => <f.input label="Offence / charge (optional)" placeholder="e.g. Aggravated robbery" />}
        </form.AppField>
        <form.AppField name="documentsPending">
          {(f) => (
            <Field orientation="horizontal" className="items-center pt-6">
              <Switch
                checked={f.state.value}
                onCheckedChange={(v) => {
                  f.handleChange(v)
                  if (!v) form.setFieldValue('pendingDocumentType', '')
                }}
              />
              <FieldLabel>Documents pending</FieldLabel>
            </Field>
          )}
        </form.AppField>
      </div>
      <FieldDescription>
        Mark when a prisoner was admitted before the committed warrant arrived. Their status stays 'Convicted'; release is
        blocked until the documents are received.
      </FieldDescription>

      {useStore(form.baseStore, (s) => s.values.documentsPending) && (
        <form.AppField name="pendingDocumentType">
          {(f) => (
            <Field>
              <FieldLabel>What is pending</FieldLabel>
              <Select items={pendingDocumentTypes} value={f.state.value} onValueChange={(value) => f.handleChange(value ?? '')}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select document" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {pendingDocumentTypes.map((t) => (
                      <SelectItem key={t.value} value={t.value}>
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
          )}
        </form.AppField>
      )}

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

      <form.AppField name="notes">
        {(f) => (
          <Field>
            <FieldLabel>Notes</FieldLabel>
            <RichTextInput value={f.state.value} onChange={f.handleChange} placeholder="Notes…" />
          </Field>
        )}
      </form.AppField>

      <DrawerFooter>
        <form.AppForm>
          <form.submit label="Save changes" />
        </form.AppForm>
      </DrawerFooter>
    </form>
  )
}
