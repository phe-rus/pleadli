import {
  stationAssetCategories,
  stationAssetPersonName,
  stationAssetsOptions,
  stationAssetStatusLabel,
  useStationAssets,
  type StationAsset,
} from '@/features/station-assets'
import { ArchiveIcon, GunIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { DataTable, selectColumn, type DataTableColumnDef } from '@pleadli/forms-tables'
import { Badge } from '@pleadli/ui/badge'
import { createFileRoute, Link } from '@tanstack/react-router'
import { format } from 'date-fns/format'
import { useMemo } from 'react'

export const Route = createFileRoute('/_public/stores/')({
  loader: async ({ context }) => {
    await context.queryClient.query({ ...stationAssetsOptions(''), staleTime: 'static' })
  },
  component: RouteComponent,
})

function categoryLabel(category: string) {
  return stationAssetCategories.find((c) => c.value === category)?.label ?? category
}

function RouteComponent() {
  const { data: assets } = useStationAssets('')
  const armoryCount = assets.filter((a) => a.category === 'armory').length
  const impoundedCount = assets.filter((a) => a.category === 'impounded').length

  const columns: DataTableColumnDef<StationAsset>[] = useMemo(() => {
    return [
      selectColumn(),
      {
        accessorKey: 'id',
        header: 'ID',
        cell: ({ row }) => <span className="rounded-md bg-primary/15 px-3 py-1 text-xs">{row.original.id}</span>,
      },
      {
        accessorKey: 'category',
        header: 'Category',
        cell: ({ row }) => <Badge variant="secondary">{categoryLabel(row.original.category)}</Badge>,
      },
      { accessorKey: 'description', header: 'Description' },
      {
        accessorKey: 'itemIdentifier',
        header: 'Identifier',
        cell: ({ row }) => row.original.itemIdentifier ?? '·',
      },
      {
        accessorKey: 'status',
        header: 'Status',
        cell: ({ getValue }) => stationAssetStatusLabel(getValue<string>()),
      },
      {
        accessorKey: 'holderName',
        header: 'Held by',
        cell: ({ row }) => row.original.holderName ?? '·',
      },
      { accessorKey: 'personId', header: 'Person ID', cell: ({ row }) => row.original.personId ?? '·' },
      {
        id: 'relatedPerson',
        accessorFn: (row) => stationAssetPersonName(row) ?? '',
        header: 'Related person',
        cell: ({ getValue }) => getValue<string>() || '·',
      },
      {
        accessorKey: 'personFirstName',
        header: 'Person first name',
        cell: ({ row }) => row.original.personFirstName ?? '·',
      },
      {
        accessorKey: 'personLastName',
        header: 'Person last name',
        cell: ({ row }) => row.original.personLastName ?? '·',
      },
      {
        accessorKey: 'personOtherNames',
        header: 'Person other names',
        cell: ({ row }) => row.original.personOtherNames ?? '·',
      },
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
      <section className="flex flex-col">
        <h1>Stores &amp; Armory</h1>
        <p className="md:max-w-lg">
          Everything the station holds: weapons and equipment, and property impounded from the public. Sort or
          filter here, or go to a specific register below.
        </p>
      </section>

      <section className="grid grid-cols-2 gap-3 md:max-w-sm">
        <Link
          to="/stores/armory"
          className="flex flex-col gap-1 rounded-md border border-border/40 p-3 transition-colors hover:bg-muted/60"
        >
          <div className="flex items-center gap-2">
            <HugeiconsIcon icon={GunIcon} className="size-4" />
            <h3 className="text-sm">Armory Register</h3>
          </div>
          <p className="text-xs text-muted-foreground">{armoryCount} items</p>
        </Link>
        <Link
          to="/stores/impounded"
          className="flex flex-col gap-1 rounded-md border border-border/40 p-3 transition-colors hover:bg-muted/60"
        >
          <div className="flex items-center gap-2">
            <HugeiconsIcon icon={ArchiveIcon} className="size-4" />
            <h3 className="text-sm">Impounded Assets</h3>
          </div>
          <p className="text-xs text-muted-foreground">{impoundedCount} items</p>
        </Link>
      </section>

      <DataTable
        aria-label="All station assets"
        data={assets}
        columns={columns}
        getRowId={(row) => row.id}
        emptyMessage="Nothing recorded yet."
        searchPlaceholder="Search across armory and impounded assets…"
      />
    </article>
  )
}
