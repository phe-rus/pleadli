import { useHqConfig } from '@/features/session'
import { ApiError } from '@/lib/api'
import { useAppForm } from '@pleadli/forms-tables/forms'
import { DrawerFooter } from '@pleadli/ui/drawer'
import { Field, FieldLabel } from '@pleadli/ui/field'
import { Switch } from '@pleadli/ui/switch'
import { t } from '@pleadli/ui/goey-toaster'
import { useCreateOfficer, useUpdateOfficer } from './queries'
import { officerRoles, type Officer } from './schema'

export type OfficerFormProps = {
  officer?: Officer
  onSuccess?: (officer: Officer) => void
}

/** Create or edit an account. The signed-in administrator's session is the
 * credential: the node checks `accounts.manage` on the request, so nothing
 * here asks for a password again. */
export function OfficerForm({ officer, onSuccess }: OfficerFormProps) {
  const { data: config } = useHqConfig()
  const roles = officerRoles(config?.isHeadOffice ?? false)
  const createOfficer = useCreateOfficer()
  const updateOfficer = useUpdateOfficer()

  const form = useAppForm({
    defaultValues: {
      badgeNumber: officer?.badgeNumber ?? '',
      name: officer?.name ?? '',
      role: officer?.role ?? roles[1].value,
      isAdmin: officer?.isAdmin ?? false,
      active: officer?.active ?? true,
      password: '',
    },
    onSubmit: async ({ value, formApi }) => {
      try {
        const result = officer
          ? await updateOfficer.mutateAsync({
              id: officer.id,
              input: {
                name: value.name,
                role: value.role,
                isAdmin: value.isAdmin,
                active: value.active,
                password: value.password.trim() ? value.password : null,
              },
            })
          : await createOfficer.mutateAsync({
              badgeNumber: value.badgeNumber,
              name: value.name,
              role: value.role,
              isAdmin: value.isAdmin,
              password: value.password,
            })
        t.success(officer ? 'Account updated' : 'Account added')
        formApi.reset()
        onSuccess?.(result)
      } catch (error) {
        t.error(officer ? 'Could not update account' : 'Could not add account', {
          description: error instanceof ApiError ? error.message : 'Please try again.',
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
        <form.AppField name="badgeNumber">{(f) => <f.input label="Badge number" disabled={Boolean(officer)} />}</form.AppField>
        <form.AppField name="role">{(f) => <f.select label="Role" options={[...roles]} />}</form.AppField>
      </div>

      <form.AppField name="name">{(f) => <f.input label="Full name" />}</form.AppField>

      <form.AppField name="password">
        {(f) => (
          <f.input
            type="password"
            label={officer ? 'New password' : 'Password'}
            placeholder={officer ? 'Leave blank to keep the current password' : undefined}
          />
        )}
      </form.AppField>

      <form.AppField name="isAdmin">
        {(f) => (
          <Field orientation="horizontal">
            <Switch checked={f.state.value} onCheckedChange={f.handleChange} />
            <FieldLabel>Can manage accounts, workstations, backups and the audit trail</FieldLabel>
          </Field>
        )}
      </form.AppField>

      {officer && (
        <form.AppField name="active">
          {(f) => (
            <Field orientation="horizontal">
              <Switch checked={f.state.value} onCheckedChange={f.handleChange} />
              <FieldLabel>Active</FieldLabel>
            </Field>
          )}
        </form.AppField>
      )}

      <DrawerFooter>
        <form.AppForm>
          <form.submit label={officer ? 'Save changes' : 'Add account'} />
        </form.AppForm>
      </DrawerFooter>
    </form>
  )
}
