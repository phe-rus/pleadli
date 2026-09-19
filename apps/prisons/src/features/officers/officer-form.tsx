import { useHqConfig } from '@/features/session'
import { ApiError } from '@/lib/api'
import { useAppForm } from '@pleadli/forms-tables/forms'
import { PhotoCapture } from '@/components/photo-capture'
import { Button } from '@pleadli/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@pleadli/ui/dialog'
import { DrawerFooter } from '@pleadli/ui/drawer'
import { Field, FieldLabel } from '@pleadli/ui/field'
import { Switch } from '@pleadli/ui/switch'
import { t } from '@pleadli/ui/goey-toaster'
import { useState } from 'react'
import { useCreateOfficer, useDeleteOfficer, useUpdateOfficer } from './queries'
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
  const deleteOfficer = useDeleteOfficer()
  const [confirmDelete, setConfirmDelete] = useState(false)
  const canDelete = Boolean(officer) && (config?.isHeadOffice ?? false)

  const form = useAppForm({
    defaultValues: {
      badgeNumber: officer?.badgeNumber ?? '',
      name: officer?.name ?? '',
      role: officer?.role ?? roles[1].value,
      isAdmin: officer?.isAdmin ?? false,
      active: officer?.active ?? true,
      password: '',
      rank: officer?.rank ?? '',
      phone: officer?.phone ?? '',
      email: officer?.email ?? '',
      photoData: officer?.photoData ?? (null as string | null),
      postedFacilityId: officer?.postedFacilityId ?? '',
    },
    onSubmit: async ({ value, formApi }) => {
      const profile = {
        rank: value.rank.trim() || null,
        phone: value.phone.trim() || null,
        email: value.email.trim() || null,
        photoData: value.photoData,
        postedFacilityId: value.postedFacilityId.trim() || null,
      }
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
                ...profile,
              },
            })
          : await createOfficer.mutateAsync({
              badgeNumber: value.badgeNumber,
              name: value.name,
              role: value.role,
              isAdmin: value.isAdmin,
              password: value.password,
              ...profile,
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
      <div className="flex flex-wrap items-start gap-5">
        <form.AppField name="photoData">
          {(f) => (
            <PhotoCapture
              className="w-36 shrink-0"
              label="Photo"
              shape="square"
              value={f.state.value}
              onChange={(next) => f.handleChange(next)}
            />
          )}
        </form.AppField>
        <div className="flex min-w-56 flex-1 flex-col gap-4">
          <form.AppField name="name">{(f) => <f.input label="Full name" autoComplete="name" />}</form.AppField>
          <div className="grid grid-cols-2 gap-3">
            <form.AppField name="badgeNumber">
              {(f) => <f.input label="Badge number" autoComplete="username" disabled={Boolean(officer)} />}
            </form.AppField>
            <form.AppField name="rank">{(f) => <f.input label="Rank" autoComplete="organization-title" />}</form.AppField>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <form.AppField name="phone">{(f) => <f.input label="Phone" type="tel" autoComplete="tel" />}</form.AppField>
        <form.AppField name="email">{(f) => <f.input label="Email" type="email" autoComplete="email" />}</form.AppField>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <form.AppField name="role">{(f) => <f.select label="Role" options={[...roles]} />}</form.AppField>
        {config?.isHeadOffice && (
          <form.AppField name="postedFacilityId">
            {(f) => <f.input label="Posted facility ID" placeholder="Optional" autoComplete="off" />}
          </form.AppField>
        )}
      </div>

      <form.AppField name="password">
        {(f) => (
          <f.input
            type="password"
            autoComplete="new-password"
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
        {canDelete && officer && (
          <Button type="button" variant="destructive" onClick={() => setConfirmDelete(true)}>
            Delete account
          </Button>
        )}
      </DrawerFooter>

      {officer && (
        <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Delete {officer.name}?</DialogTitle>
              <DialogDescription>
                This removes the account for badge {officer.badgeNumber} and signs it out everywhere. The audit trail keeps what this officer
                did, under their badge number and name. This cannot be undone. To keep the account but stop it signing in, deactivate it instead.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setConfirmDelete(false)}>
                Cancel
              </Button>
              <Button
                type="button"
                variant="destructive"
                disabled={deleteOfficer.isPending}
                onClick={() =>
                  deleteOfficer.mutate(officer.id, {
                    onSuccess: () => {
                      t.success('Account deleted')
                      setConfirmDelete(false)
                      onSuccess?.(officer)
                    },
                    onError: (error) => {
                      setConfirmDelete(false)
                      t.error('Could not delete the account', {
                        description: error instanceof ApiError ? error.message : 'Please try again.',
                      })
                    },
                  })
                }
              >
                {deleteOfficer.isPending ? 'Deleting…' : 'Delete account'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </form>
  )
}
