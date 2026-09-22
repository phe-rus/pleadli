import { Createpanel } from '@/components/create-panel'
import { useDeepLinkRecord } from '@/hooks/use-deep-link-record'
import { peopleOptions, personFullName, PersonForm, usePeople, type Person } from '@/features/people'
import { AddCircleIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { DataTable, selectColumn, type DataTableColumnDef } from '@pleadli/forms-tables'
import { Button } from '@pleadli/ui/button'
import { cn } from '@pleadli/ui/lib/utils'
import { createFileRoute } from '@tanstack/react-router'
import { format } from 'date-fns/format'
import { useMemo, useState } from 'react'

export const Route = createFileRoute('/_public/people/')({
  validateSearch: (search: Record<string, unknown>): { open?: string } =>
    typeof search.open === 'string' ? { open: search.open } : {},
  loader: async ({ context }) => {
    await context.queryClient.query({ ...peopleOptions(''), staleTime: 'static' })
  },
  component: RouteComponent,
})

function RouteComponent() {
  const { open: openId } = Route.useSearch()
  const [addOpen, setAddOpen] = useState(false)
  const [addDirty, setAddDirty] = useState(false)
  const [editingPerson, setEditingPerson] = useState<Person | null>(null)
  const [editDirty, setEditDirty] = useState(false)
  const { data: people } = usePeople('')
  useDeepLinkRecord(people, openId, setEditingPerson)

  const columns: DataTableColumnDef<Person>[] = useMemo(() => {
    return [
      selectColumn(),
      {
        accessorKey: 'id',
        header: 'ID',
        cell: ({ row }) => (
          <span
            className={cn('rounded-md bg-primary/15 px-3 py-1 text-xs', 'cursor-pointer')}
            onClick={() => setEditingPerson(row.original)}
          >
            {row.original.id}
          </span>
        ),
      },
      { id: 'name', accessorFn: (row) => personFullName(row), header: 'Name' },
      { accessorKey: 'otherNames', header: 'Other names', cell: ({ row }) => row.original.otherNames ?? '·' },
      { accessorKey: 'phone', header: 'Phone', cell: ({ row }) => row.original.phone ?? '·' },
      { accessorKey: 'nationalId', header: 'National ID', cell: ({ row }) => row.original.nationalId ?? '·' },
      { accessorKey: 'address', header: 'Address', cell: ({ row }) => row.original.address ?? '·' },
      {
        accessorKey: 'createdAt',
        header: 'Recorded',
        cell: ({ getValue }) => format(getValue<number>(), 'PPp'),
      },
    ]
  }, [])

  return (
    <article className="page">
      <header className="page-header">
        <div>
          <h1>People</h1>
          <p>Accused, complainants and witnesses referenced across the files.</p>
        </div>
        <div className="page-actions">
          <Createpanel
            open={addOpen}
            onOpenChange={setAddOpen}
            isDirty={addDirty}
            trigger={
              <Button size="sm">
                <HugeiconsIcon icon={AddCircleIcon} />
                Add a person
              </Button>
            }
            headings={{ title: 'Add a person', description: "Record someone who isn't already known to the system." }}
          >
            <PersonForm onSuccess={() => setAddOpen(false)} onDirtyChange={setAddDirty} />
          </Createpanel>
        </div>
      </header>

      <Createpanel
        open={editingPerson !== null}
        onOpenChange={(open) => {
          if (!open) setEditingPerson(null)
        }}
        isDirty={editDirty}
        headings={{ title: 'Edit person', description: 'Update what was recorded.' }}
      >
        {editingPerson && (
          <PersonForm
            key={editingPerson.id}
            person={editingPerson}
            onSuccess={() => setEditingPerson(null)}
            onDirtyChange={setEditDirty}
          />
        )}
      </Createpanel>

      <DataTable
        aria-label="People"
        data={people}
        columns={columns}
        getRowId={(row) => row.id}
        emptyMessage="No one recorded yet."
        searchPlaceholder="Search people…"
      />
    </article>
  )
}
