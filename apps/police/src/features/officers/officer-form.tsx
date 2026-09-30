import * as m from '@/paraglide/messages'
import { PersonPicker } from '@/components/person-picker'
import { useReportDirty } from '@/hooks/use-report-dirty'
import { useAppForm } from '@pleadli/forms-tables/forms'
import { DrawerFooter } from '@pleadli/ui/drawer'
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@pleadli/ui/field'
import { t } from '@pleadli/ui/goey-toaster'
import { Switch } from '@pleadli/ui/switch'
import { useCreateOfficer, useUpdateOfficer } from './queries'
import { officerPostSuggestions, officerRoles, type Officer } from './schema'

export type OfficerFormProps = {
  officer?: Officer
  onSuccess?: (officer: Officer) => void
  onDirtyChange?: (dirty: boolean) => void
}

/** One officer: who they are and what they hold here. A badge number and a
 * password are both optional; an officer with neither is simply on the
 * station's books, which is what a roster and a case record need. */
export function OfficerForm({ officer, onSuccess, onDirtyChange }: OfficerFormProps) {
  const createOfficer = useCreateOfficer()
  const updateOfficer = useUpdateOfficer()

  const form = useAppForm({
    defaultValues: {
      name: officer?.name ?? '',
      rank: officer?.rank ?? '',
      post: officer?.post ?? '',
      badgeNumber: officer?.badgeNumber ?? '',
      role: officer?.role ?? 'officer',
      active: officer?.active ?? true,
      personId: officer?.personId ?? (null as string | null),
      notes: officer?.notes ?? '',
      password: '',
    },
    onSubmit: async ({ value }) => {
      try {
        const result = officer
          ? await updateOfficer.mutateAsync({
              id: officer.id,
              input: { ...value, password: value.password.trim() ? value.password : null },
            })
          : await createOfficer.mutateAsync({
              name: value.name,
              rank: value.rank,
              post: value.post,
              badgeNumber: value.badgeNumber,
              role: value.role,
              notes: value.notes,
              personId: value.personId,
              password: value.password,
            })
        t.success(officer ? m["officers.updated"]() : m["officers.added"]())
        onSuccess?.(result)
      } catch (error) {
        t.error(officer ? m["officers.update_failed"]() : m["officers.add_failed"](), {
          description: error instanceof Error && error.message ? error.message : m["common.try_again"](),
        })
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
      <FieldGroup>
        <form.AppField name="name">{(f) => <f.input label={m["common.full_name"]()} />}</form.AppField>

        <div className="grid grid-cols-2 gap-3">
          <form.AppField name="rank">{(f) => <f.input label={m["common.rank"]()} />}</form.AppField>
          <form.AppField name="post">
            {(f) => <f.input label={m["officers.post"]()} placeholder={m["common.eg"]({ examples: officerPostSuggestions.slice(0, 2).join(', ') })} />}
          </form.AppField>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <form.AppField name="badgeNumber">{(f) => <f.input label={m["officers.badge_number"]()} placeholder={m["common.optional"]()} />}</form.AppField>
          <form.AppField name="role">{(f) => <f.select label={m["common.role"]()} options={[...officerRoles]} />}</form.AppField>
        </div>

        <form.AppField name="personId">
          {(f) => (
            <Field>
              <FieldLabel>{m["officers.linked_person"]()}</FieldLabel>
              <PersonPicker value={f.state.value} onValueChange={f.handleChange} placeholder={m["officers.link_placeholder"]()} />
            </Field>
          )}
        </form.AppField>

        <form.AppField name="notes">{(f) => <f.textarea label={m["common.notes"]()} />}</form.AppField>

        <form.AppField name="password">
          {(f) => (
            <f.input
              type="password"
              label={officer?.hasSignIn ? m["officers.new_password"]() : m["officers.remote_password"]()}
              placeholder={officer?.hasSignIn ? m["officers.keep_password"]() : m["common.optional"]()}
            />
          )}
        </form.AppField>
        <FieldDescription>{m["officers.password_hint"]()}</FieldDescription>

        {officer && (
          <form.AppField name="active">
            {(f) => (
              <Field orientation="horizontal">
                <Switch checked={f.state.value} onCheckedChange={f.handleChange} />
                <FieldLabel>{m["officers.active"]()}</FieldLabel>
              </Field>
            )}
          </form.AppField>
        )}
      </FieldGroup>

      <DrawerFooter>
        <form.AppForm>
          <form.submit label={officer ? m["common.save_changes"]() : m["officers.submit"]()} />
        </form.AppForm>
      </DrawerFooter>
    </form>
  )
}
