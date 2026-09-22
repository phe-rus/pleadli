import { Createpanel } from '@/components/create-panel'
import { officerRoleLabel, officersOptions, OfficerForm, useOfficers, type Officer } from '@/features/officers'
import { AddCircleIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { DataTable, selectColumn, type DataTableColumnDef } from '@pleadli/forms-tables'
import { Badge } from '@pleadli/ui/badge'
import { Button } from '@pleadli/ui/button'
import { cn } from '@pleadli/ui/lib/utils'
import { createFileRoute } from '@tanstack/react-router'
import { format } from 'date-fns/format'
import { useMemo, useState } from 'react'

export const Route = createFileRoute('/_public/station/officers')({
  loader: async ({ context }) => {
    await context.queryClient.query({ ...officersOptions(), staleTime: 'static' })
  },
  component: RouteComponent,
})

function RouteComponent() {
  const [addOpen, setAddOpen] = useState(false)
  const [addDirty, setAddDirty] = useState(false)
  const [editing, setEditing] = useState<Officer | null>(null)
  const [editDirty, setEditDirty] = useState(false)
  const { data: officers } = useOfficers()
  const here = officers.filter((o) => o.active).length

  const columns: DataTableColumnDef<Officer>[] = useMemo(() => {
    return [
      selectColumn(),
      {
        accessorKey: 'id',
        header: 'ID',
        cell: ({ row }) => (
          <span className={cn('rounded-md bg-primary/15 px-3 py-1 text-xs', 'cursor-pointer')} onClick={() => setEditing(row.original)}>
            {row.original.id}
          </span>
        ),
      },
      { accessorKey: 'name', header: 'Name' },
      { accessorKey: 'rank', header: 'Rank', cell: ({ row }) => row.original.rank ?? '·' },
      { accessorKey: 'post', header: 'Standing post', cell: ({ row }) => row.original.post ?? '·' },
      { accessorKey: 'badgeNumber', header: 'Badge number', cell: ({ row }) => row.original.badgeNumber ?? '·' },
      {
        accessorKey: 'role',
        header: 'Role',
        cell: ({ row }) => <Badge variant="secondary">{officerRoleLabel(row.original.role)}</Badge>,
      },
      {
        accessorKey: 'hasSignIn',
        header: 'Remote sign-in',
        cell: ({ row }) => (row.original.hasSignIn ? 'Yes' : 'No'),
      },
      {
        accessorKey: 'active',
        header: 'Status',
        cell: ({ row }) => <Badge variant={row.original.active ? 'default' : 'secondary'}>{row.original.active ? 'At the station' : 'Left'}</Badge>,
      },
      { accessorKey: 'personId', header: 'Person ID', cell: ({ row }) => row.original.personId ?? '·' },
      { accessorKey: 'notes', header: 'Notes', cell: ({ row }) => row.original.notes ?? '·' },
      {
        accessorKey: 'createdAt',
        header: 'Added',
        cell: ({ getValue }) => format(getValue<number>(), 'PPp'),
      },
    ]
  }, [])

  return (
    <article className="page">
      <header className="page-header">
        <div>
          <h1>Officers</h1>
          <p>
            Everyone who works at this station: {here} at the station, {officers.length - here} left. The roster, statements and charge sheets choose from this list. A remote sign-in is optional.
          </p>
        </div>
        <div className="page-actions">
          <Createpanel
            open={addOpen}
            onOpenChange={setAddOpen}
            isDirty={addDirty}
            trigger={
              <Button size="sm">
                <HugeiconsIcon icon={AddCircleIcon} />
                Add officer
              </Button>
            }
            headings={{ title: 'Add officer', description: 'Someone who works at this station.' }}
          >
            <OfficerForm onSuccess={() => setAddOpen(false)} onDirtyChange={setAddDirty} />
          </Createpanel>
        </div>
      </header>

      <Createpanel
        open={editing !== null}
        onOpenChange={(open) => {
          if (!open) setEditing(null)
        }}
        isDirty={editDirty}
        headings={{ title: 'Edit officer', description: 'Update this officer.' }}
      >
        {editing && <OfficerForm key={editing.id} officer={editing} onSuccess={() => setEditing(null)} onDirtyChange={setEditDirty} />}
      </Createpanel>

      <DataTable
        aria-label="Officers"
        data={officers}
        columns={columns}
        getRowId={(row) => row.id}
        emptyMessage="No officers added yet."
        searchPlaceholder="Search by name, rank, post or badge number"
      />
    </article>
  )
}
