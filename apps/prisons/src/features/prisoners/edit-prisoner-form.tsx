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
import { m } from '@/paraglide/messages'

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
        if (value.documentsPending && !value.pendingDocumentType) return m.prisoners_select_which_document_is_pending()
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
        t.success(m.prisoners_prisoner_details_updated())
        onSuccess?.(result)
      } catch {
        t.error(m.prisoners_could_not_update_prisoner_details(), { description: m.prisoners_please_try_again() })
      }
    },
  })

  useReportDirty(form, onDirtyChange)

  return (
    <form
      className="panel-body"
      onSubmit={(event) => {
        event.preventDefault()
        form.handleSubmit()
      }}
    >
      <div className="grid grid-cols-2 gap-3">
        <form.AppField name="firstName">{(f) => <f.input label={m.prisoners_first_name()} />}</form.AppField>
        <form.AppField name="lastName">{(f) => <f.input label={m.prisoners_last_name()} />}</form.AppField>
      </div>

      <form.AppField name="otherNames">{(f) => <f.input label={m.prisoners_other_names()} />}</form.AppField>

      <div className="grid grid-cols-2 gap-3">
        <form.AppField name="nationalId">{(f) => <f.input label={m.prisoners_national_id()} />}</form.AppField>
        <form.AppField name="reference">{(f) => <f.input label={m.prisoners_reference()} />}</form.AppField>
      </div>

      <form.AppField name="currentLocation">
        {(f) => <f.input label={m.prisoners_current_location_optional()} placeholder={m.prisoners_e_g_ward_3_whatever_this()} />}
      </form.AppField>

      <div className="grid grid-cols-2 gap-3">
        <form.AppField name="dateOfBirth">
          {(f) => (
            <Field>
              <FieldLabel>{m.prisoners_date_of_birth()}</FieldLabel>
              <Input type="date" value={f.state.value} onChange={(e) => f.handleChange(e.target.value)} />
            </Field>
          )}
        </form.AppField>
        <form.AppField name="sex">
          {(f) => (
            <Field>
              <FieldLabel>{m.prisoners_sex()}</FieldLabel>
              <Select items={prisonerSexes} value={f.state.value} onValueChange={(value) => f.handleChange(value ?? f.state.value)}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={m.prisoners_select_sex()} />
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
              <FieldLabel>{m.prisoners_education_level()}</FieldLabel>
              <Select items={educationLevels} value={f.state.value} onValueChange={(value) => f.handleChange(value ?? f.state.value)}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={m.prisoners_select_level()} />
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
              <FieldLabel>{m.prisoners_nationality()}</FieldLabel>
              <Select items={nationalities} value={f.state.value} onValueChange={(value) => f.handleChange(value ?? f.state.value)}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={m.prisoners_select_nationality()} />
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
          {(f) => <f.input label={m.prisoners_offence_charge_optional()} placeholder={m.prisoners_e_g_aggravated_robbery()} />}
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
              <FieldLabel>{m.prisoners_documents_pending()}</FieldLabel>
            </Field>
          )}
        </form.AppField>
      </div>
      <FieldDescription>
        {m.prisoners_mark_when_a_prisoner_was_admitted()}
      </FieldDescription>

      {useStore(form.baseStore, (s) => s.values.documentsPending) && (
        <form.AppField name="pendingDocumentType">
          {(f) => (
            <Field>
              <FieldLabel>{m.prisoners_what_is_pending()}</FieldLabel>
              <Select items={pendingDocumentTypes} value={f.state.value} onValueChange={(value) => f.handleChange(value ?? '')}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={m.prisoners_select_document()} />
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
              <FieldLabel>{m.prisoners_status()}</FieldLabel>
              <Select items={prisonerStatuses} value={f.state.value} onValueChange={(value) => f.handleChange(value ?? f.state.value)}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={m.prisoners_select_status()} />
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
              <FieldLabel>{m.prisoners_offence_triable_only_by_the_high()}</FieldLabel>
            </Field>
          )}
        </form.AppField>
      </div>

      <form.AppField name="notes">
        {(f) => (
          <Field>
            <FieldLabel>{m.prisoners_notes()}</FieldLabel>
            <RichTextInput value={f.state.value} onChange={f.handleChange} placeholder={m.prisoners_notes_2()} />
          </Field>
        )}
      </form.AppField>

      <DrawerFooter>
        <form.AppForm>
          <form.submit label={m.prisoners_save_changes()} />
        </form.AppForm>
      </DrawerFooter>
    </form>
  )
}
