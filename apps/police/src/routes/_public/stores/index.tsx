import * as m from '@/paraglide/messages'
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
import { format } from '@/lib/date'
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
        header: m["col.id"](),
        cell: ({ row }) => <span className="rounded-md bg-primary/15 px-3 py-1 text-xs">{row.original.id}</span>,
      },
      {
        accessorKey: 'category',
        header: m["col.category"](),
        cell: ({ row }) => <Badge variant="secondary">{categoryLabel(row.original.category)}</Badge>,
      },
      { accessorKey: 'description', header: m["col.description"]() },
      {
        accessorKey: 'itemIdentifier',
        header: m["col.identifier"](),
        cell: ({ row }) => row.original.itemIdentifier ?? '·',
      },
      {
        accessorKey: 'status',
        header: m["col.status"](),
        cell: ({ getValue }) => stationAssetStatusLabel(getValue<string>()),
      },
      {
        accessorKey: 'holderName',
        header: m["col.held_by"](),
        cell: ({ row }) => row.original.holderName ?? '·',
      },
      { accessorKey: 'personId', header: m["col.person_id"](), cell: ({ row }) => row.original.personId ?? '·' },
      {
        id: 'relatedPerson',
        accessorFn: (row) => stationAssetPersonName(row) ?? '',
        header: m["col.related_person"](),
        cell: ({ getValue }) => getValue<string>() || '·',
      },
      {
        accessorKey: 'personFirstName',
        header: m["col.person_first_name"](),
        cell: ({ row }) => row.original.personFirstName ?? '·',
      },
      {
        accessorKey: 'personLastName',
        header: m["col.person_last_name"](),
        cell: ({ row }) => row.original.personLastName ?? '·',
      },
      {
        accessorKey: 'personOtherNames',
        header: m["col.person_other_names"](),
        cell: ({ row }) => row.original.personOtherNames ?? '·',
      },
      { accessorKey: 'notes', header: m["col.notes"](), cell: ({ row }) => row.original.notes ?? '·' },
      {
        accessorKey: 'createdAt',
        header: m["col.added"](),
        cell: ({ getValue }) => format(getValue<number>(), 'PPp'),
      },
    ]
  }, [])

  return (
    <article className="page">
      <section className="flex flex-col">
        <h1>{m["stores.title"]()}</h1>
        <p className="md:max-w-lg">
          {m["stores.lead"]()}
        </p>
      </section>

      <section className="grid grid-cols-2 gap-3 md:max-w-sm">
        <Link
          to="/stores/armory"
          className="flex flex-col gap-1 rounded-md border border-border/40 p-3 transition-colors hover:bg-muted/60"
        >
          <div className="flex items-center gap-2">
            <HugeiconsIcon icon={GunIcon} className="size-4" />
            <h3 className="text-sm">{m["stores.armory"]()}</h3>
          </div>
          <p className="text-xs text-muted-foreground">{m["stores.items"]({ count: armoryCount })}</p>
        </Link>
        <Link
          to="/stores/impounded"
          className="flex flex-col gap-1 rounded-md border border-border/40 p-3 transition-colors hover:bg-muted/60"
        >
          <div className="flex items-center gap-2">
            <HugeiconsIcon icon={ArchiveIcon} className="size-4" />
            <h3 className="text-sm">{m["stores.impounded"]()}</h3>
          </div>
          <p className="text-xs text-muted-foreground">{m["stores.items"]({ count: impoundedCount })}</p>
        </Link>
      </section>

      <DataTable
        aria-label={m["stores.table"]()}
        data={assets}
        columns={columns}
        getRowId={(row) => row.id}
        emptyMessage={m["common.nothing_recorded"]()}
        searchPlaceholder={m["stores.search"]()}
      />
    </article>
  )
}
