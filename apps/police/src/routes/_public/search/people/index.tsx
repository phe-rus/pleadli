import { Createpanel } from '@/components/create-panel'
import { peopleSearchOptions, PersonForm, usePeopleSearch, type Person } from '@/features/people'
import { AddCircleIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { DataTable, selectColumn, type DataTableColumnDef } from '@pleadli/forms-tables'
import { Button } from '@pleadli/ui/button'
import { cn } from '@pleadli/ui/lib/utils'
import { createFileRoute } from '@tanstack/react-router'
import { format } from 'date-fns/format'
import { useMemo, useState } from 'react'

export const Route = createFileRoute('/_public/search/people')({
  loader: async ({ context }) => {
    await context.queryClient.query({ ...peopleSearchOptions(''), staleTime: 'static' })
  },
  component: RouteComponent,
})

function RouteComponent() {
  const [addOpen, setAddOpen] = useState(false)
  const [editingPerson, setEditingPerson] = useState<Person | null>(null)
  const { data: people } = usePeopleSearch('')

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
      { accessorKey: 'firstName', header: 'First name' },
      { accessorKey: 'lastName', header: 'Last name' },
      { accessorKey: 'otherNames', header: 'Other names' },
      {
        accessorKey: 'phone',
        header: 'Phone',
        cell: ({ row }) => row.original.phone ?? '—',
      },
      {
        accessorKey: 'nationalId',
        header: 'NIN / National ID',
        cell: ({ row }) => row.original.nationalId ?? '—',
      },
      {
        accessorKey: 'address',
        header: 'Address',
        cell: ({ row }) => row.original.address ?? '—',
      },
      {
        accessorKey: 'createdAt',
        header: 'Added',
        cell: ({ row }) => format(row.original.createdAt, 'PPPPpp'),
      },
    ]
  }, [])

  return (
    <article className="container flex flex-col gap-5 pt-5 pb-20">
      <section className="flex items-center gap-4">
        <div className="flex flex-col">
          <div className="flex items-center gap-5">
            <h1>People</h1>

            <Createpanel
              open={addOpen}
              onOpenChange={setAddOpen}
              trigger={
                <Button size="sm">
                  <HugeiconsIcon icon={AddCircleIcon} />
                  Add person
                </Button>
              }
              headings={{
                title: 'Add person',
                description: "Record someone who isn't already known to the system.",
              }}
            >
              <PersonForm onSuccess={() => setAddOpen(false)} />
            </Createpanel>
          </div>
          <p className="md:max-w-sm">
            Find a person, or add one if they aren't known to the system yet.
          </p>
        </div>
      </section>

      <Createpanel
        open={editingPerson !== null}
        onOpenChange={(open) => {
          if (!open) setEditingPerson(null)
        }}
        headings={{
          title: 'Edit person',
          description: 'Update this person\'s recorded details.',
        }}
      >
        {editingPerson && (
          <PersonForm
            key={editingPerson.id}
            person={editingPerson}
            onSuccess={() => setEditingPerson(null)}
          />
        )}
      </Createpanel>

      <DataTable
        aria-label="People"
        data={people}
        columns={columns}
        getRowId={(row) => row.id}
        emptyMessage="No people recorded yet."
        searchPlaceholder="Search people by name, phone, or national ID…"
      />
    </article>
  )
}
