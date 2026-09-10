import { Createpanel } from '@/components/create-panel'
import { useDeepLinkRecord } from '@/hooks/use-deep-link-record'
import { AddCircleIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { DataTable, selectColumn, type DataTableColumnDef } from '@pleadli/forms-tables'
import { Button } from '@pleadli/ui/button'
import { cn } from '@pleadli/ui/lib/utils'
import { useSearch } from '@tanstack/react-router'
import { useMemo, useState } from 'react'
import { StationAssetForm } from './station-asset-form'
import { useStationAssets } from './queries'
import { stationAssetPersonName, stationAssetStatusLabel, type StationAsset } from './schema'

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
      {
        id: 'relatedPerson',
        accessorFn: (row) => stationAssetPersonName(row) ?? '',
        header: 'Related person',
        cell: ({ getValue }) => getValue<string>() || '·',
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
        headings={{ title: 'Edit item', description: 'Update this record.' }}
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
        emptyMessage="Nothing recorded yet."
        searchPlaceholder="Search…"
      />
    </article>
  )
}
