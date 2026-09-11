import { Createpanel } from '@/components/create-panel'
import { useDeepLinkRecord } from '@/hooks/use-deep-link-record'
import { useVehicles, vehicleOwnerName, vehiclesOptions, VehicleForm, type Vehicle } from '@/features/vehicles'
import { AddCircleIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { DataTable, selectColumn, type DataTableColumnDef } from '@pleadli/forms-tables'
import { Button } from '@pleadli/ui/button'
import { cn } from '@pleadli/ui/lib/utils'
import { createFileRoute } from '@tanstack/react-router'
import { format } from 'date-fns/format'
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
      { accessorKey: 'plateNumber', header: 'Plate number' },
      { accessorKey: 'make', header: 'Make', cell: ({ row }) => row.original.make ?? '·' },
      { accessorKey: 'model', header: 'Model', cell: ({ row }) => row.original.model ?? '·' },
      { accessorKey: 'color', header: 'Color', cell: ({ row }) => row.original.color ?? '·' },
      { accessorKey: 'ownerPersonId', header: 'Owner ID', cell: ({ row }) => row.original.ownerPersonId ?? '·' },
      {
        id: 'owner',
        accessorFn: (row) => vehicleOwnerName(row) ?? '',
        header: 'Owner',
        cell: ({ getValue }) => getValue<string>() || '·',
      },
      {
        accessorKey: 'ownerFirstName',
        header: 'Owner first name',
        cell: ({ row }) => row.original.ownerFirstName ?? '·',
      },
      {
        accessorKey: 'ownerLastName',
        header: 'Owner last name',
        cell: ({ row }) => row.original.ownerLastName ?? '·',
      },
      {
        accessorKey: 'ownerOtherNames',
        header: 'Owner other names',
        cell: ({ row }) => row.original.ownerOtherNames ?? '·',
      },
      { accessorKey: 'notes', header: 'Notes', cell: ({ row }) => row.original.notes ?? '·' },
      {
        accessorKey: 'createdAt',
        header: 'Logged',
        cell: ({ getValue }) => format(getValue<number>(), 'PPp'),
      },
    ]
  }, [])

  return (
    <article className="container flex flex-col gap-5 pt-5 pb-20">
      <section className="flex items-center gap-4">
        <div className="flex flex-col">
          <div className="flex items-center gap-5">
            <h1>Vehicles</h1>

            <Createpanel
              open={addOpen}
              onOpenChange={setAddOpen}
              trigger={
                <Button size="sm">
                  <HugeiconsIcon icon={AddCircleIcon} />
                  Add vehicle
                </Button>
              }
              headings={{ title: 'Add vehicle', description: 'Record a plate number, and its owner if known.' }}
            >
              <VehicleForm onSuccess={() => setAddOpen(false)} />
            </Createpanel>
          </div>
          <p className="md:max-w-sm">Look someone up by their vehicle, or a vehicle up by its plate.</p>
        </div>
      </section>

      <Createpanel
        open={editing !== null}
        onOpenChange={(open) => {
          if (!open) setEditing(null)
        }}
        headings={{ title: 'Edit vehicle', description: 'Update this record.' }}
      >
        {editing && <VehicleForm key={editing.id} vehicle={editing} onSuccess={() => setEditing(null)} />}
      </Createpanel>

      <DataTable
        aria-label="Vehicles"
        data={vehicles}
        columns={columns}
        getRowId={(row) => row.id}
        emptyMessage="No vehicles recorded yet."
        searchPlaceholder="Search by plate, make, or model…"
      />
    </article>
  )
}
