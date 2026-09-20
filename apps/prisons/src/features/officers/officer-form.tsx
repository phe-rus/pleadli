import { useHqConfig } from '@/features/session'
import { ApiError } from '@/lib/api'
import { useAppForm } from '@pleadli/forms-tables/forms'
import { PhotoCapture } from '@/components/photo-capture'
import { Button } from '@pleadli/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@pleadli/ui/dialog'
import { DrawerFooter } from '@pleadli/ui/drawer'
import { Field, FieldDescription, FieldLabel } from '@pleadli/ui/field'
import { Switch } from '@pleadli/ui/switch'
import { t } from '@pleadli/ui/goey-toaster'
import { useState } from 'react'
import { useCreateOfficer, useDeleteOfficer, useUpdateOfficer } from './queries'
import { officerRoles, type Officer } from './schema'
import { m } from '@/paraglide/messages'

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
      passwordless: officer?.passwordless ?? false,
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
                passwordless: !value.isAdmin && value.passwordless !== officer.passwordless ? value.passwordless : null,
                ...profile,
              },
            })
          : await createOfficer.mutateAsync({
              badgeNumber: value.badgeNumber,
              name: value.name,
              role: value.role,
              isAdmin: value.isAdmin,
              password: value.password,
              passwordless: !value.isAdmin && value.passwordless,
              ...profile,
            })
        t.success(officer ? m.officers_account_updated() : m.officers_account_added())
        formApi.reset()
        onSuccess?.(result)
      } catch (error) {
        t.error(officer ? m.officers_could_not_update_account() : m.officers_could_not_add_account(), {
          description: error instanceof ApiError ? error.message : m.officers_please_try_again(),
        })
      }
    },
  })

  return (
    <form
      className="panel-body"
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
              label={m.officers_photo()}
              shape="square"
              value={f.state.value}
              onChange={(next) => f.handleChange(next)}
            />
          )}
        </form.AppField>
        <div className="flex min-w-56 flex-1 flex-col gap-4">
          <form.AppField name="name">{(f) => <f.input label={m.officers_full_name()} autoComplete="name" />}</form.AppField>
          <div className="grid grid-cols-2 gap-3">
            <form.AppField name="badgeNumber">
              {(f) => <f.input label={m.officers_badge_number()} autoComplete="username" disabled={Boolean(officer)} />}
            </form.AppField>
            <form.AppField name="rank">{(f) => <f.input label={m.officers_rank()} autoComplete="organization-title" />}</form.AppField>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <form.AppField name="phone">{(f) => <f.input label={m.officers_phone()} type="tel" autoComplete="tel" />}</form.AppField>
        <form.AppField name="email">{(f) => <f.input label={m.officers_email()} type="email" autoComplete="email" />}</form.AppField>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <form.AppField name="role">{(f) => <f.select label={m.officers_role()} options={[...roles]} />}</form.AppField>
        {config?.isHeadOffice && (
          <form.AppField name="postedFacilityId">
            {(f) => <f.input label={m.officers_posted_facility_id()} placeholder={m.officers_optional()} autoComplete="off" />}
          </form.AppField>
        )}
      </div>

      <form.Subscribe selector={(state) => [state.values.passwordless, state.values.isAdmin] as const}>
        {([passwordless, isAdmin]) => (
          <>
            {!isAdmin && !config?.isHeadOffice && (config?.authMode === 'badge_only' || officer?.passwordless) && (
              <form.AppField name="passwordless">
                {(f) => (
                  <Field orientation="horizontal" className="items-start">
                    <Switch aria-label={m.officers_signs_in_with_the_badge_alone()} checked={f.state.value} onCheckedChange={f.handleChange} />
                    <div className="flex flex-col gap-0.5">
                      <FieldLabel>{m.officers_signs_in_with_the_badge_alone()}</FieldLabel>
                      <FieldDescription>{m.officers_no_password_or_pin_each_such()}</FieldDescription>
                    </div>
                  </Field>
                )}
              </form.AppField>
            )}
            {!(passwordless && !isAdmin) && (
              <form.AppField name="password">
                {(f) => (
                  <f.input
                    type="password"
                    autoComplete="new-password"
                    label={officer ? (config?.authMode === 'pin' ? m.officers_new_password_or_pin() : m.officers_new_password()) : config?.authMode === 'pin' ? m.officers_password_or_pin() : m.officers_password()}
                    placeholder={officer ? m.officers_leave_blank_to_keep_the_current() : undefined}
                  />
                )}
              </form.AppField>
            )}
          </>
        )}
      </form.Subscribe>

      <form.AppField name="isAdmin">
        {(f) => (
          <Field orientation="horizontal">
            <Switch aria-label={m.officers_can_manage_accounts_workstations_backups()} checked={f.state.value} onCheckedChange={f.handleChange} />
            <FieldLabel>{m.officers_can_manage_accounts_workstations_backups()}</FieldLabel>
          </Field>
        )}
      </form.AppField>

      {officer && (
        <form.AppField name="active">
          {(f) => (
            <Field orientation="horizontal">
              <Switch aria-label={m.officers_active()} checked={f.state.value} onCheckedChange={f.handleChange} />
              <FieldLabel>{m.officers_active()}</FieldLabel>
            </Field>
          )}
        </form.AppField>
      )}

      <DrawerFooter>
        <form.AppForm>
          <form.submit label={officer ? m.officers_save_changes() : m.officers_add_account()} />
        </form.AppForm>
        {canDelete && officer && (
          <Button type="button" variant="destructive" onClick={() => setConfirmDelete(true)}>
            {m.officers_delete_account()}
          </Button>
        )}
      </DrawerFooter>

      {officer && (
        <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>{m.officers_delete({ name: officer.name })}</DialogTitle>
              <DialogDescription>
                {m.officers_this_removes_the_account_for_badge({ badgeNumber: officer.badgeNumber })}</DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setConfirmDelete(false)}>
                {m.officers_cancel()}
              </Button>
              <Button
                type="button"
                variant="destructive"
                disabled={deleteOfficer.isPending}
                onClick={() =>
                  deleteOfficer.mutate(officer.id, {
                    onSuccess: () => {
                      t.success(m.officers_account_deleted())
                      setConfirmDelete(false)
                      onSuccess?.(officer)
                    },
                    onError: (error) => {
                      setConfirmDelete(false)
                      t.error(m.officers_could_not_delete_the_account(), {
                        description: error instanceof ApiError ? error.message : m.officers_please_try_again(),
                      })
                    },
                  })
                }
              >
                {deleteOfficer.isPending ? m.officers_deleting() : m.officers_delete_account()}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </form>
  )
}
