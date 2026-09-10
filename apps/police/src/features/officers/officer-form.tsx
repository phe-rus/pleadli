import { PersonPicker } from '@/components/person-picker'
import { useAppForm } from '@pleadli/forms-tables/forms'
import { DrawerFooter } from '@pleadli/ui/drawer'
import { Field, FieldLabel } from '@pleadli/ui/field'
import { t } from '@pleadli/ui/goey-toaster'
import { Switch } from '@pleadli/ui/switch'
import { useCreateOfficer, useUpdateOfficer } from './queries'
import { officerRoles, type Officer } from './schema'

export type OfficerFormProps = {
  officer?: Officer
  onSuccess?: (officer: Officer) => void
}

export function OfficerForm({ officer, onSuccess }: OfficerFormProps) {
  const createOfficer = useCreateOfficer()
  const updateOfficer = useUpdateOfficer()

  const form = useAppForm({
    defaultValues: {
      badgeNumber: officer?.badgeNumber ?? '',
      name: officer?.name ?? '',
      role: officer?.role ?? 'officer',
      active: officer?.active ?? true,
      personId: officer?.personId ?? null,
      password: '',
    },
    onSubmit: async ({ value }) => {
      try {
        const result = officer
          ? await updateOfficer.mutateAsync({
              id: officer.id,
              input: {
                name: value.name,
                role: value.role,
                active: value.active,
                personId: value.personId,
                password: value.password.trim() ? value.password : null,
              },
            })
          : await createOfficer.mutateAsync({
              badgeNumber: value.badgeNumber,
              name: value.name,
              role: value.role,
              password: value.password,
              personId: value.personId,
            })
        t.success(officer ? 'Officer updated' : 'Officer added')
        onSuccess?.(result)
      } catch {
        t.error(officer ? 'Could not update officer' : 'Could not add officer', {
          description: 'Please try again.',
        })
      }
    },
  })

  return (
    <form
      className="flex flex-1 flex-col gap-4 overflow-y-auto p-4"
      onSubmit={(event) => {
        event.preventDefault()
        form.handleSubmit()
      }}
    >
      <div className="grid grid-cols-2 gap-3">
        <form.AppField name="badgeNumber">
          {(f) => <f.input label="Badge number" disabled={Boolean(officer)} />}
        </form.AppField>
        <form.AppField name="role">
          {(f) => <f.select label="Role" options={[...officerRoles]} />}
        </form.AppField>
      </div>

      <form.AppField name="name">{(f) => <f.input label="Full name" />}</form.AppField>

      <form.AppField name="personId">
        {(f) => (
          <Field>
            <FieldLabel>Linked person</FieldLabel>
            <PersonPicker
              value={f.state.value}
              onValueChange={f.handleChange}
              placeholder="Link this officer's own person record…"
            />
          </Field>
        )}
      </form.AppField>

      <form.AppField name="password">
        {(f) => (
          <f.input
            type="password"
            label={officer ? 'New password' : 'Password'}
            placeholder={officer ? 'Leave blank to keep the current password' : undefined}
          />
        )}
      </form.AppField>

      {officer && (
        <form.AppField name="active">
          {(f) => (
            <Field orientation="horizontal">
              <Switch checked={f.state.value} onCheckedChange={f.handleChange} />
              <FieldLabel>Active: can log in remotely</FieldLabel>
            </Field>
          )}
        </form.AppField>
      )}

      <DrawerFooter>
        <form.AppForm>
          <form.submit label={officer ? 'Save changes' : 'Add officer'} />
        </form.AppForm>
      </DrawerFooter>
    </form>
  )
}
