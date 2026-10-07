import * as m from '@/paraglide/messages'
import { formatDate } from '@/lib/dates'
import { Createpanel } from '@/components/create-panel'
import { useDeepLinkRecord } from '@/hooks/use-deep-link-record'
import { peopleOptions, personFullName, PersonForm, usePeople, type Person } from '@/features/people'
import { DataTable, selectColumn, type DataTableColumnDef } from '@pleadli/forms-tables'
import { Button } from '@pleadli/ui/button'
import { createFileRoute } from '@tanstack/react-router'
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
        id: 'name',
        accessorFn: (row) => personFullName(row),
        header: () => m["people.col.name"](),
        cell: ({ row }) => (
          <button type="button" onClick={() => setEditingPerson(row.original)} className="flex cursor-pointer flex-col text-start">
            <span className="font-medium text-foreground">{personFullName(row.original)}</span>
            {row.original.phone && <span className="text-muted-foreground">{row.original.phone}</span>}
          </button>
        ),
      },
      { accessorKey: 'id', header: () => m["people.col.id"]() },
      { accessorKey: 'otherNames', header: () => m["people.col.other_names"](), cell: ({ row }) => row.original.otherNames ?? '·' },
      { accessorKey: 'phone', header: () => m["people.col.phone"](), cell: ({ row }) => row.original.phone ?? '·' },
      { accessorKey: 'nationalId', header: () => m["people.col.national_id"](), cell: ({ row }) => row.original.nationalId ?? '·' },
      { accessorKey: 'address', header: () => m["people.col.address"](), cell: ({ row }) => row.original.address ?? '·' },
      {
        accessorKey: 'createdAt',
        header: () => m["people.col.recorded"](),
        cell: ({ getValue }) => formatDate(getValue<number>(), 'datetime'),
      },
    ]
  }, [])

  return (
    <article className="page">
      <header className="page-header">
        <div>
          <h1>{m["nav.item.people"]()}</h1>
          <p>{m["people.subtitle"]()}</p>
        </div>
        <div className="page-actions">
          <Createpanel
            open={addOpen}
            onOpenChange={setAddOpen}
            isDirty={addDirty}
            trigger={
              <Button size="sm">{m["workspace.quick.add_person"]()}</Button>
            }
            headings={{ title: m["workspace.quick.add_person"](), description: m["workspace.quick.add_person_description"]() }}
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
        headings={{ title: m["people.edit"](), description: m["people.edit_description"]() }}
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
        aria-label={m["nav.item.people"]()}
        data={people}
        columns={columns}
        getRowId={(row) => row.id}
        emptyMessage={m["people.empty"]()}
        initialHidden={['id', 'otherNames']}
        searchPlaceholder={m["people.search"]()}
      />
    </article>
  )
}
