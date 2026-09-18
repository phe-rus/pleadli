import { useAppForm } from '@pleadli/forms-tables/forms'
import { DrawerFooter } from '@pleadli/ui/drawer'
import { Field, FieldLabel } from '@pleadli/ui/field'
import { Separator } from '@pleadli/ui/separator'
import { Switch } from '@pleadli/ui/switch'
import { t } from '@pleadli/ui/goey-toaster'
import { useCreateOfficer, useCreateOfficerTrusted, useUpdateOfficer, useUpdateOfficerTrusted } from './queries'
import { officerRoles, OfficerError, type Officer } from './schema'

export type OfficerFormProps = {
  officer?: Officer
  /** True only for the very first officer on a brand new installation —
   * no preceding admin exists yet to supply credentials, so the backend
   * itself skips the admin check for this one call. */
  isBootstrap?: boolean
  /** True on a Head Office installation: it already has a real, signed
   * in session (spec: docs/specs/prisons/0001-head-office-peer-sync-
   * network/index.md's cross child contract), so re-asking for a badge
   * and password on top of that session would prove nothing new. A
   * facility installation has no such session, so it always asks
   * (unchanged, spec: docs/specs/_root/0001-officer-identity-sign-in). */
  trusted?: boolean
  onSuccess?: (officer: Officer) => void
}

/** A facility installation asks for the acting admin's own badge and
 * password right here on every create or edit, checked fresh each call —
 * there is no signed in session to assume (spec: docs/specs/_root/0001-
 * officer-identity-sign-in). Head Office skips that (`trusted`); its own
 * session already proves who is asking. `isBootstrap` skips it too, for
 * the one time first-admin case where no admin exists yet to ask. */
export function OfficerForm({ officer, isBootstrap = false, trusted = false, onSuccess }: OfficerFormProps) {
  const createOfficer = useCreateOfficer()
  const updateOfficer = useUpdateOfficer()
  const createOfficerTrusted = useCreateOfficerTrusted()
  const updateOfficerTrusted = useUpdateOfficerTrusted()
  const skipAdminFields = isBootstrap || trusted

  const form = useAppForm({
    defaultValues: {
      badgeNumber: officer?.badgeNumber ?? '',
      name: officer?.name ?? '',
      role: officer?.role ?? (isBootstrap ? 'admin' : 'officer'),
      active: officer?.active ?? true,
      password: '',
      adminBadgeNumber: '',
      adminPassword: '',
    },
    onSubmit: async ({ value, formApi }) => {
      try {
        const result = officer
          ? trusted
            ? await updateOfficerTrusted.mutateAsync({
                id: officer.id,
                input: {
                  name: value.name,
                  role: value.role,
                  active: value.active,
                  password: value.password.trim() ? value.password : null,
                },
              })
            : await updateOfficer.mutateAsync({
                id: officer.id,
                input: {
                  name: value.name,
                  role: value.role,
                  active: value.active,
                  password: value.password.trim() ? value.password : null,
                  adminBadgeNumber: value.adminBadgeNumber,
                  adminPassword: value.adminPassword,
                },
              })
          : trusted
            ? await createOfficerTrusted.mutateAsync({
                badgeNumber: value.badgeNumber,
                name: value.name,
                role: value.role,
                password: value.password,
              })
            : await createOfficer.mutateAsync({
                badgeNumber: value.badgeNumber,
                name: value.name,
                role: value.role,
                password: value.password,
                adminBadgeNumber: isBootstrap ? null : value.adminBadgeNumber,
                adminPassword: isBootstrap ? null : value.adminPassword,
              })
        t.success(officer ? 'Officer updated' : 'Officer added')
        formApi.reset()
        onSuccess?.(result)
      } catch (error) {
        if (error instanceof OfficerError) {
          t.error(officer ? 'Could not update officer' : 'Could not add officer', { description: error.message })
        } else {
          t.error(officer ? 'Could not update officer' : 'Could not add officer', { description: 'Please try again.' })
        }
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
        {!isBootstrap && <form.AppField name="role">{(f) => <f.select label="Role" options={[...officerRoles]} />}</form.AppField>}
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

      {!skipAdminFields && (
        <>
          <Separator />
          <p className="text-xs text-muted-foreground">
            {officer ? 'Confirm your own admin credentials to save this change.' : 'Confirm your own admin credentials to add this officer.'}
          </p>
          <div className="grid grid-cols-2 gap-3">
            <form.AppField name="adminBadgeNumber">{(f) => <f.input label="Your badge number" />}</form.AppField>
            <form.AppField name="adminPassword">{(f) => <f.input type="password" label="Your password" />}</form.AppField>
          </div>
        </>
      )}

      <DrawerFooter>
        <form.AppForm>
          <form.submit label={officer ? 'Save changes' : isBootstrap ? 'Create first admin' : 'Add officer'} />
        </form.AppForm>
      </DrawerFooter>
    </form>
  )
}
