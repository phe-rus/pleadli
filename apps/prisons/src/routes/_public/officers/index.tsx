import { Createpanel } from '@/components/create-panel'
import {
  officerRoleLabel,
  OfficerForm,
  useIsBootstrap,
  useOfficers,
  useOfficersTrusted,
  type Officer,
} from '@/features/officers'
import { useHqConfig } from '@/features/session'
import { AddCircleIcon, LockKeyIcon, ShieldKeyIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { DataTable, selectColumn, type DataTableColumnDef } from '@pleadli/forms-tables'
import { useAppForm } from '@pleadli/forms-tables/forms'
import { Badge } from '@pleadli/ui/badge'
import { Button } from '@pleadli/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@pleadli/ui/dialog'
import { cn } from '@pleadli/ui/lib/utils'
import { useQueryClient } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { format } from 'date-fns/format'
import { useMemo, useState } from 'react'

export const Route = createFileRoute('/_public/officers/')({
  component: RouteComponent,
})

function RouteComponent() {
  const { data: hqConfig, isLoading } = useHqConfig()

  return (
    <article className="container flex flex-col gap-5 pt-5 pb-20">
      <section className="flex flex-col gap-1">
        <h1>Officers</h1>
        <p className="md:max-w-lg">
          {hqConfig?.isHeadOffice ? 'Every officer account in the system.' : 'Officer accounts for this installation.'}
        </p>
      </section>

      {!isLoading && (hqConfig?.isHeadOffice ? <TrustedOfficersPanel /> : <FacilityOfficersPanel />)}
    </article>
  )
}

/** Head Office already has a real, signed in session (spec: docs/specs/
 * prisons/0001-head-office-peer-sync-network/index.md's cross child
 * contract) — the whole app is already gated on it by `HqSignInGate`, so
 * asking again here for a badge and password would prove nothing new.
 * No unlock step, no "Lock" button: the officer signing out of the app
 * itself is what ends this access. */
function TrustedOfficersPanel() {
  const [addOpen, setAddOpen] = useState(false)
  const [editing, setEditing] = useState<Officer | null>(null)
  const { data: officers } = useOfficersTrusted(true)

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-end gap-4">
        <Createpanel
          open={addOpen}
          onOpenChange={setAddOpen}
          trigger={
            <Button size="sm">
              <HugeiconsIcon icon={AddCircleIcon} />
              Add officer
            </Button>
          }
          headings={{ title: 'Add officer', description: 'Create a new officer account for this installation.' }}
        >
          <OfficerForm trusted onSuccess={() => setAddOpen(false)} />
        </Createpanel>
      </div>

      <Createpanel
        open={editing !== null}
        onOpenChange={(open) => {
          if (!open) setEditing(null)
        }}
        headings={{ title: 'Edit officer', description: 'Update this officer account.' }}
      >
        {editing && <OfficerForm key={editing.id} officer={editing} trusted onSuccess={() => setEditing(null)} />}
      </Createpanel>

      <OfficersTable officers={officers ?? []} onSelect={setEditing} />
    </div>
  )
}

/** A facility installation has no persistent session to assume (spec:
 * docs/specs/_root/0001-officer-identity-sign-in): every visit re-asks
 * for the viewer's own admin credentials. Three real states, not two:
 * no officer exists yet at all (bootstrap — set up the first admin, no
 * credentials to ask for), officers exist but this visit hasn't unlocked
 * (locked dialog), or unlocked (the table). `useIsBootstrap` is what
 * distinguishes the first state — it already existed on the backend and
 * in `OfficerForm` but was never wired into this page until now. */
function FacilityOfficersPanel() {
  const { data: isBootstrap, isLoading } = useIsBootstrap()
  const [unlocked, setUnlocked] = useState<{ adminBadgeNumber: string; adminPassword: string } | null>(null)

  if (isLoading) return null
  if (isBootstrap) return <BootstrapPanel />
  return unlocked ? (
    <UnlockedOfficersPanel credentials={unlocked} onLockOut={() => setUnlocked(null)} />
  ) : (
    <LockedOfficersPanel onUnlocked={setUnlocked} />
  )
}

/** No officer exists yet on this installation. Nothing to unlock — the
 * first account created here is forced to `role: 'admin'` by `OfficerForm
 * isBootstrap`. Once it's created, `isBootstrap` flips false and the next
 * render falls through to the normal locked-dialog flow: this new admin
 * logs in with the credentials they just set, same as anyone after them. */
function BootstrapPanel() {
  const queryClient = useQueryClient()

  return (
    <>
      <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border py-16 text-center text-muted-foreground">
        <HugeiconsIcon icon={ShieldKeyIcon} size={20} />
        <p className="text-sm">No officers on this installation yet.</p>
      </div>

      <Dialog open>
        <DialogContent showCloseButton={false} className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Set up this installation</DialogTitle>
            <DialogDescription>
              Create the first officer account. It becomes the administrator for this facility and can add every
              other officer afterward.
            </DialogDescription>
          </DialogHeader>
          <OfficerForm
            isBootstrap
            onSuccess={() => {
              queryClient.invalidateQueries({ queryKey: ['officers', 'isBootstrap'] })
            }}
          />
        </DialogContent>
      </Dialog>
    </>
  )
}

function LockedOfficersPanel({ onUnlocked }: { onUnlocked: (credentials: { adminBadgeNumber: string; adminPassword: string }) => void }) {
  return (
    <>
      <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border py-16 text-center text-muted-foreground">
        <HugeiconsIcon icon={LockKeyIcon} size={20} />
        <p className="text-sm">Officer accounts are locked.</p>
      </div>

      <Dialog open>
        <DialogContent showCloseButton={false} className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Unlock officer accounts</DialogTitle>
            <DialogDescription>Enter your admin badge and password to manage officer accounts.</DialogDescription>
          </DialogHeader>
          <UnlockForm onUnlocked={onUnlocked} />
        </DialogContent>
      </Dialog>
    </>
  )
}

function UnlockForm({ onUnlocked }: { onUnlocked: (credentials: { adminBadgeNumber: string; adminPassword: string }) => void }) {
  const form = useAppForm({
    defaultValues: { adminBadgeNumber: '', adminPassword: '' },
    onSubmit: async ({ value }) => {
      onUnlocked(value)
    },
  })

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault()
        form.handleSubmit()
      }}
    >
      <form.AppField name="adminBadgeNumber">{(f) => <f.input label="Badge number" autoFocus />}</form.AppField>
      <form.AppField name="adminPassword">{(f) => <f.input type="password" label="Password" />}</form.AppField>
      <form.AppForm>
        <form.submit label="Unlock" />
      </form.AppForm>
    </form>
  )
}

function UnlockedOfficersPanel({
  credentials,
  onLockOut,
}: {
  credentials: { adminBadgeNumber: string; adminPassword: string }
  onLockOut: () => void
}) {
  const [addOpen, setAddOpen] = useState(false)
  const [editing, setEditing] = useState<Officer | null>(null)
  const { data: officers, error } = useOfficers(credentials.adminBadgeNumber, credentials.adminPassword, true)

  if (error) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-sm text-destructive">Those admin credentials didn't work.</p>
        <Button size="sm" variant="secondary" onClick={onLockOut}>
          Try again
        </Button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-4">
        <Button size="sm" variant="secondary" onClick={onLockOut}>
          Lock
        </Button>

        <Createpanel
          open={addOpen}
          onOpenChange={setAddOpen}
          trigger={
            <Button size="sm">
              <HugeiconsIcon icon={AddCircleIcon} />
              Add officer
            </Button>
          }
          headings={{ title: 'Add officer', description: 'Create a new officer account for this installation.' }}
        >
          <OfficerForm onSuccess={() => setAddOpen(false)} />
        </Createpanel>
      </div>

      <Createpanel
        open={editing !== null}
        onOpenChange={(open) => {
          if (!open) setEditing(null)
        }}
        headings={{ title: 'Edit officer', description: 'Update this officer account.' }}
      >
        {editing && <OfficerForm key={editing.id} officer={editing} onSuccess={() => setEditing(null)} />}
      </Createpanel>

      <OfficersTable officers={officers ?? []} onSelect={setEditing} />
    </div>
  )
}

/** The table itself is identical either way — both roles look at the
 * same one `officers` table, only the auth mechanism to reach it differs. */
function OfficersTable({ officers, onSelect }: { officers: Officer[]; onSelect: (officer: Officer) => void }) {
  const columns: DataTableColumnDef<Officer>[] = useMemo(
    () => [
      selectColumn(),
      {
        accessorKey: 'id',
        header: 'ID',
        cell: ({ row }) => (
          <span className={cn('rounded-md bg-primary/15 px-3 py-1 text-xs', 'cursor-pointer')} onClick={() => onSelect(row.original)}>
            {row.original.id}
          </span>
        ),
      },
      { accessorKey: 'badgeNumber', header: 'Badge number' },
      { accessorKey: 'name', header: 'Name' },
      {
        accessorKey: 'role',
        header: 'Role',
        cell: ({ row }) => <Badge variant="secondary">{officerRoleLabel(row.original.role)}</Badge>,
      },
      {
        accessorKey: 'active',
        header: 'Status',
        cell: ({ row }) => <Badge variant={row.original.active ? 'default' : 'secondary'}>{row.original.active ? 'Active' : 'Disabled'}</Badge>,
      },
      {
        accessorKey: 'createdAt',
        header: 'Added',
        cell: ({ getValue }) => format(getValue<number>(), 'PPp'),
      },
    ],
    [onSelect],
  )

  return (
    <DataTable
      aria-label="Officers"
      data={officers}
      columns={columns}
      getRowId={(row) => row.id}
      emptyMessage="No officers added yet."
      searchPlaceholder="Search by name or badge number…"
    />
  )
}
