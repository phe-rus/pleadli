import { Createpanel } from '@/components/create-panel'
import { officerRoleLabel, OfficerForm, useOfficers, type Officer } from '@/features/officers'
import { useHqConfig, usePermissions } from '@/features/session'
import { AddCircleIcon, ShieldKeyIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { DataTable, selectColumn, type DataTableColumnDef } from '@pleadli/forms-tables'
import { Badge } from '@pleadli/ui/badge'
import { Button } from '@pleadli/ui/button'
import { cn } from '@pleadli/ui/lib/utils'
import { createFileRoute } from '@tanstack/react-router'
import { format } from 'date-fns/format'
import { useMemo, useState } from 'react'

export const Route = createFileRoute('/_public/officers/')({
  component: RouteComponent,
})

/** Accounts of this installation. The node decides who may manage them
 * (`accounts.manage`); this page only asks and shows what it is told. */
function RouteComponent() {
  const { data: config } = useHqConfig()
  const { can, session } = usePermissions()

  return (
    <article className="container flex flex-col gap-5 pt-5 pb-20">
      <section className="flex flex-col gap-1">
        <h1>Accounts</h1>
        <p className="md:max-w-lg">
          {config?.isHeadOffice ? 'Every account in Head Office.' : 'Officer accounts for this facility.'} Accounts are deactivated,
          never deleted, so every record still shows who acted.
        </p>
      </section>

      {session &&
        (can('accounts.manage') ? (
          <AccountsPanel />
        ) : (
          <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border py-16 text-center text-muted-foreground">
            <HugeiconsIcon icon={ShieldKeyIcon} size={20} />
            <p className="text-sm">Only an administrator can manage accounts.</p>
          </div>
        ))}
    </article>
  )
}

function AccountsPanel() {
  const [addOpen, setAddOpen] = useState(false)
  const [editing, setEditing] = useState<Officer | null>(null)
  const { data: officers } = useOfficers(true)

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-end gap-4">
        <Createpanel
          open={addOpen}
          onOpenChange={setAddOpen}
          trigger={
            <Button size="sm">
              <HugeiconsIcon icon={AddCircleIcon} />
              Add account
            </Button>
          }
          headings={{ title: 'Add account', description: 'Create a new account for this installation.' }}
        >
          <OfficerForm onSuccess={() => setAddOpen(false)} />
        </Createpanel>
      </div>

      <Createpanel
        open={editing !== null}
        onOpenChange={(open) => {
          if (!open) setEditing(null)
        }}
        headings={{ title: 'Edit account', description: 'Update this account.' }}
      >
        {editing && <OfficerForm key={editing.id} officer={editing} onSuccess={() => setEditing(null)} />}
      </Createpanel>

      <OfficersTable officers={officers ?? []} onSelect={setEditing} />
    </div>
  )
}

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
        accessorKey: 'isAdmin',
        header: 'Administrator',
        cell: ({ row }) => (row.original.isAdmin ? <Badge>Administrator</Badge> : <span className="text-muted-foreground">No</span>),
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
