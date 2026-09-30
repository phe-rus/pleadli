import * as m from '@/paraglide/messages'
import { Createpanel } from '@/components/create-panel'
import { peopleSearchOptions, PersonForm, usePeopleSearch, type Person } from '@/features/people'
import { AddCircleIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { DataTable, selectColumn, type DataTableColumnDef } from '@pleadli/forms-tables'
import { Button } from '@pleadli/ui/button'
import { cn } from '@pleadli/ui/lib/utils'
import { createFileRoute, Link } from '@tanstack/react-router'
import { format } from '@/lib/date'
import { useMemo, useState } from 'react'

export const Route = createFileRoute('/_public/search/people/')({
  loader: async ({ context }) => {
    await context.queryClient.query({ ...peopleSearchOptions(''), staleTime: 'static' })
  },
  component: RouteComponent,
})

function RouteComponent() {
  const [addOpen, setAddOpen] = useState(false)
  const { data: people } = usePeopleSearch('')

  const columns: DataTableColumnDef<Person>[] = useMemo(() => {
    return [
      selectColumn(),
      {
        accessorKey: 'id',
        header: m["col.id"](),
        cell: ({ row }) => (
          <Link
            to="/search/people/$personId"
            params={{ personId: row.original.id }}
            className={cn('rounded-md bg-primary/15 px-3 py-1 text-xs')}
          >
            {row.original.id}
          </Link>
        ),
      },
      { accessorKey: 'firstName', header: m["col.first_name"]() },
      { accessorKey: 'lastName', header: m["col.last_name"]() },
      { accessorKey: 'otherNames', header: m["col.other_names"]() },
      {
        accessorKey: 'phone',
        header: m["col.phone"](),
        cell: ({ row }) => row.original.phone ?? '·',
      },
      {
        accessorKey: 'nationalId',
        header: m["col.nin_national_id"](),
        cell: ({ row }) => row.original.nationalId ?? '·',
      },
      {
        accessorKey: 'address',
        header: m["col.address"](),
        cell: ({ row }) => row.original.address ?? '·',
      },
      {
        accessorKey: 'createdAt',
        header: m["col.added"](),
        cell: ({ row }) => format(row.original.createdAt, 'PPPPpp'),
      },
    ]
  }, [])

  return (
    <article className="page">
      <section className="flex items-center gap-4">
        <div className="flex flex-col">
          <div className="flex items-center gap-5">
            <h1>{m["nav.people"]()}</h1>

            <Createpanel
              open={addOpen}
              onOpenChange={setAddOpen}
              trigger={
                <Button size="sm">
                  <HugeiconsIcon icon={AddCircleIcon} />
                  {m["pickers.person_add_title"]()}
                </Button>
              }
              headings={{
                title: m["pickers.person_add_title"](),
                description: m["pickers.person_add_description"](),
              }}
            >
              <PersonForm onSuccess={() => setAddOpen(false)} />
            </Createpanel>
          </div>
          <p className="md:max-w-sm">
            {m["people_page.lead"]()}
          </p>
        </div>
      </section>

      <DataTable
        aria-label={m["nav.people"]()}
        data={people}
        columns={columns}
        getRowId={(row) => row.id}
        emptyMessage={m["people_page.empty"]()}
        searchPlaceholder={m["people_page.search"]()}
      />
    </article>
  )
}
