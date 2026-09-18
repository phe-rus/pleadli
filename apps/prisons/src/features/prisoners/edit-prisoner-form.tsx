import { useReportDirty } from '@/hooks/use-report-dirty'
import { RichTextInput } from '@pleadli/rich-text'
import { useAppForm } from '@pleadli/forms-tables/forms'
import { DrawerFooter } from '@pleadli/ui/drawer'
import { Field, FieldLabel } from '@pleadli/ui/field'
import { t } from '@pleadli/ui/goey-toaster'
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@pleadli/ui/select'
import { Switch } from '@pleadli/ui/switch'
import { useUpdatePrisoner } from './queries'
import { prisonerStatuses, updatePrisonerSchema, type Prisoner } from './schema'

export type EditPrisonerFormProps = {
  prisoner: Prisoner
  onSuccess?: (prisoner: Prisoner) => void
  onDirtyChange?: (dirty: boolean) => void
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
      notes: prisoner.notes ?? '',
    },
    validators: {
      onSubmit: ({ value }) => {
        const parsed = updatePrisonerSchema.safeParse(value)
        return parsed.success ? undefined : parsed.error.issues[0]?.message
      },
    },
    onSubmit: async ({ value }) => {
      try {
        const result = await updatePrisoner.mutateAsync({ id: prisoner.id, input: value })
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
