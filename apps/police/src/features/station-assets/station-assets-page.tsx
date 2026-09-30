import * as m from '@/paraglide/messages'
import { Createpanel } from '@/components/create-panel'
import { useDeepLinkRecord } from '@/hooks/use-deep-link-record'
import { AddCircleIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { DataTable, selectColumn, type DataTableColumnDef } from '@pleadli/forms-tables'
import { Button } from '@pleadli/ui/button'
import { cn } from '@pleadli/ui/lib/utils'
import { useSearch } from '@tanstack/react-router'
import { useMemo, useState } from 'react'
import { format } from '@/lib/date'
import { StationAssetForm } from './station-asset-form'
import { useStationAssets } from './queries'
import { stationAssetCategories, stationAssetPersonName, stationAssetStatusLabel, type StationAsset } from './schema'

function stationAssetCategoryLabel(category: string) {
  return stationAssetCategories.find((c) => c.value === category)?.label ?? category
}

export type StationAssetsPageProps = {
  category: string
  title: string
  description: string
  addLabel: string
}

/** Shared UI for Armory Register and Impounded Assets — same underlying
 * `station_assets` table (a `category` column distinguishes them), so this
 * is one page parameterized by category rather than two near-duplicate
 * ones. */
export function StationAssetsPage({ category, title, description, addLabel }: StationAssetsPageProps) {
  const { open: openId } = useSearch({ strict: false }) as { open?: string }
  const [addOpen, setAddOpen] = useState(false)
  const [editing, setEditing] = useState<StationAsset | null>(null)
  const { data: allAssets } = useStationAssets('')
  const assets = useMemo(() => allAssets.filter((asset) => asset.category === category), [allAssets, category])
  useDeepLinkRecord(assets, openId, setEditing)

  const columns: DataTableColumnDef<StationAsset>[] = useMemo(() => {
    return [
      selectColumn(),
      {
        accessorKey: 'id',
        header: m["common.id"](),
        cell: ({ row }) => (
          <span
            className={cn('rounded-md bg-primary/15 px-3 py-1 text-xs', 'cursor-pointer')}
            onClick={() => setEditing(row.original)}
          >
            {row.original.id}
          </span>
        ),
      },
      {
        accessorKey: 'category',
        header: m["common.category"](),
        cell: ({ getValue }) => stationAssetCategoryLabel(getValue<string>()),
      },
      { accessorKey: 'description', header: m["common.description"]() },
      {
        accessorKey: 'itemIdentifier',
        header: m["assets.identifier"](),
        cell: ({ row }) => row.original.itemIdentifier ?? '·',
      },
      {
        accessorKey: 'status',
        header: m["common.status"](),
        cell: ({ getValue }) => stationAssetStatusLabel(getValue<string>()),
      },
      {
        accessorKey: 'holderName',
        header: m["assets.held_by"](),
        cell: ({ row }) => row.original.holderName ?? '·',
      },
      { accessorKey: 'personId', header: m["common.person_id"](), cell: ({ row }) => row.original.personId ?? '·' },
      {
        id: 'relatedPerson',
        accessorFn: (row) => stationAssetPersonName(row) ?? '',
        header: m["common.related_person_col"](),
        cell: ({ getValue }) => getValue<string>() || '·',
      },
      {
        accessorKey: 'personFirstName',
        header: m["common.person_first_name"](),
        cell: ({ row }) => row.original.personFirstName ?? '·',
      },
      {
        accessorKey: 'personLastName',
        header: m["common.person_last_name"](),
        cell: ({ row }) => row.original.personLastName ?? '·',
      },
      {
        accessorKey: 'personOtherNames',
        header: m["common.person_other_names"](),
        cell: ({ row }) => row.original.personOtherNames ?? '·',
      },
      { accessorKey: 'notes', header: m["common.notes"](), cell: ({ row }) => row.original.notes ?? '·' },
      {
        accessorKey: 'createdAt',
        header: m["common.added"](),
        cell: ({ getValue }) => format(getValue<number>(), 'PPp'),
      },
    ]
  }, [])

  return (
    <article className="container flex flex-col gap-5 pt-5 pb-20">
      <section className="flex items-center gap-4">
        <div className="flex flex-col">
          <div className="flex items-center gap-5">
            <h1>{title}</h1>

            <Createpanel
              open={addOpen}
              onOpenChange={setAddOpen}
              trigger={
                <Button size="sm">
                  <HugeiconsIcon icon={AddCircleIcon} />
                  {addLabel}
                </Button>
              }
              headings={{ title: addLabel, description }}
            >
              <StationAssetForm category={category} onSuccess={() => setAddOpen(false)} />
            </Createpanel>
          </div>
          <p className="md:max-w-sm">{description}</p>
        </div>
      </section>

      <Createpanel
        open={editing !== null}
        onOpenChange={(open) => {
          if (!open) setEditing(null)
        }}
        headings={{ title: m["assets.edit"](), description: m["common.update_record"]() }}
      >
        {editing && (
          <StationAssetForm
            key={editing.id}
            category={category}
            asset={editing}
            onSuccess={() => setEditing(null)}
          />
        )}
      </Createpanel>

      <DataTable
        aria-label={title}
        data={assets}
        columns={columns}
        getRowId={(row) => row.id}
        emptyMessage={m["common.nothing_recorded"]()}
        searchPlaceholder={m["common.search_placeholder"]()}
      />
    </article>
  )
}
