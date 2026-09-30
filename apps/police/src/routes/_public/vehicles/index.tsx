import * as m from '@/paraglide/messages'
import { Createpanel } from '@/components/create-panel'
import { useDeepLinkRecord } from '@/hooks/use-deep-link-record'
import { useVehicles, vehicleOwnerName, vehiclesOptions, VehicleForm, type Vehicle } from '@/features/vehicles'
import { AddCircleIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { DataTable, selectColumn, type DataTableColumnDef } from '@pleadli/forms-tables'
import { Button } from '@pleadli/ui/button'
import { cn } from '@pleadli/ui/lib/utils'
import { createFileRoute } from '@tanstack/react-router'
import { format } from '@/lib/date'
import { useMemo, useState } from 'react'

export const Route = createFileRoute('/_public/vehicles/')({
  validateSearch: (search: Record<string, unknown>): { open?: string } =>
    typeof search.open === 'string' ? { open: search.open } : {},
  loader: async ({ context }) => {
    await context.queryClient.query({ ...vehiclesOptions(''), staleTime: 'static' })
  },
  component: RouteComponent,
})

function RouteComponent() {
  const { open: openId } = Route.useSearch()
  const [addOpen, setAddOpen] = useState(false)
  const [editing, setEditing] = useState<Vehicle | null>(null)
  const { data: vehicles } = useVehicles('')
  useDeepLinkRecord(vehicles, openId, setEditing)

  const columns: DataTableColumnDef<Vehicle>[] = useMemo(() => {
    return [
      selectColumn(),
      {
        accessorKey: 'id',
        header: m["col.id"](),
        cell: ({ row }) => (
          <span
            className={cn('rounded-md bg-primary/15 px-3 py-1 text-xs', 'cursor-pointer')}
            onClick={() => setEditing(row.original)}
          >
            {row.original.id}
          </span>
        ),
      },
      { accessorKey: 'plateNumber', header: m["col.plate_number"]() },
      { accessorKey: 'make', header: m["col.make"](), cell: ({ row }) => row.original.make ?? '·' },
      { accessorKey: 'model', header: m["col.model"](), cell: ({ row }) => row.original.model ?? '·' },
      { accessorKey: 'color', header: m["col.color"](), cell: ({ row }) => row.original.color ?? '·' },
      { accessorKey: 'ownerPersonId', header: m["col.owner_id"](), cell: ({ row }) => row.original.ownerPersonId ?? '·' },
      {
        id: 'owner',
        accessorFn: (row) => vehicleOwnerName(row) ?? '',
        header: m["col.owner"](),
        cell: ({ getValue }) => getValue<string>() || '·',
      },
      {
        accessorKey: 'ownerFirstName',
        header: m["col.owner_first_name"](),
        cell: ({ row }) => row.original.ownerFirstName ?? '·',
      },
      {
        accessorKey: 'ownerLastName',
        header: m["col.owner_last_name"](),
        cell: ({ row }) => row.original.ownerLastName ?? '·',
      },
      {
        accessorKey: 'ownerOtherNames',
        header: m["col.owner_other_names"](),
        cell: ({ row }) => row.original.ownerOtherNames ?? '·',
      },
      { accessorKey: 'notes', header: m["col.notes"](), cell: ({ row }) => row.original.notes ?? '·' },
      {
        accessorKey: 'createdAt',
        header: m["col.logged"](),
        cell: ({ getValue }) => format(getValue<number>(), 'PPp'),
      },
    ]
  }, [])

  return (
    <article className="page">
      <section className="flex items-center gap-4">
        <div className="flex flex-col">
          <div className="flex items-center gap-5">
            <h1>{m["nav.vehicles"]()}</h1>

            <Createpanel
              open={addOpen}
              onOpenChange={setAddOpen}
              trigger={
                <Button size="sm">
                  <HugeiconsIcon icon={AddCircleIcon} />
                  {m["vehicles.submit"]()}
                </Button>
              }
              headings={{ title: m["vehicles.submit"](), description: m["vehicles_page.add_desc"]() }}
            >
              <VehicleForm onSuccess={() => setAddOpen(false)} />
            </Createpanel>
          </div>
          <p className="md:max-w-sm">{m["vehicles_page.lead"]()}</p>
        </div>
      </section>

      <Createpanel
        open={editing !== null}
        onOpenChange={(open) => {
          if (!open) setEditing(null)
        }}
        headings={{ title: m["vehicles_page.edit_title"](), description: m["common.update_record"]() }}
      >
        {editing && <VehicleForm key={editing.id} vehicle={editing} onSuccess={() => setEditing(null)} />}
      </Createpanel>

      <DataTable
        aria-label={m["nav.vehicles"]()}
        data={vehicles}
        columns={columns}
        getRowId={(row) => row.id}
        emptyMessage={m["vehicles_page.empty"]()}
        searchPlaceholder={m["vehicles_page.search"]()}
      />
    </article>
  )
}
