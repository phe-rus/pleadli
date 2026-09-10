import { Createpanel } from '@/components/create-panel'
import {
  officerRoleLabel,
  officersOptions,
  OfficerForm,
  useOfficers,
  type Officer,
} from '@/features/officers'
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
  const [editing, setEditing] = useState<Officer | null>(null)
  const { data: officers } = useOfficers()

  const columns: DataTableColumnDef<Officer>[] = useMemo(() => {
    return [
      selectColumn(),
      {
        accessorKey: 'id',
        header: 'ID',
        cell: ({ row }) => (
          <span
            className={cn('rounded-md bg-primary/15 px-3 py-1 text-xs', 'cursor-pointer')}
            onClick={() => setEditing(row.original)}
          >
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
        cell: ({ row }) => (
          <Badge variant={row.original.active ? 'default' : 'secondary'}>
            {row.original.active ? 'Active' : 'Disabled'}
          </Badge>
        ),
      },
      {
        accessorKey: 'createdAt',
        header: 'Added',
        cell: ({ getValue }) => format(getValue<number>(), 'PPp'),
      },
    ]
  }, [])

  return (
    <article className="container flex flex-col gap-5 pt-5 pb-20">
      <section className="flex items-center gap-4">
        <div className="flex flex-col">
          <h1>Officers</h1>
          <p className="md:max-w-lg">
            Login credentials for remote access. Not the same as Establishment, which is a roster, not accounts.
          </p>
        </div>

        <Createpanel
          open={addOpen}
          onOpenChange={setAddOpen}
          trigger={
            <Button size="sm">
              <HugeiconsIcon icon={AddCircleIcon} />
              Add officer
            </Button>
          }
          headings={{ title: 'Add officer', description: 'Grants this officer remote-access login credentials.' }}
        >
          <OfficerForm onSuccess={() => setAddOpen(false)} />
        </Createpanel>
      </section>

      <Createpanel
        open={editing !== null}
        onOpenChange={(open) => {
          if (!open) setEditing(null)
        }}
        headings={{ title: 'Edit officer', description: 'Update this login.' }}
      >
        {editing && <OfficerForm key={editing.id} officer={editing} onSuccess={() => setEditing(null)} />}
      </Createpanel>

      <DataTable
        aria-label="Officers"
        data={officers}
        columns={columns}
        getRowId={(row) => row.id}
        emptyMessage="No officers added yet."
        searchPlaceholder="Search by name or badge number…"
      />
    </article>
  )
}
