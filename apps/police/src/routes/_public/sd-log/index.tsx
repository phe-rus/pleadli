import { Createpanel } from '@/components/create-panel'
import {
  stationDiaryCategoryLabel,
  stationDiaryOptions,
  stationDiaryRelatedPersonName,
  StationDiaryEntryForm,
  useStationDiaryEntries,
  type StationDiaryEntry,
} from '@/features/station-diary'
import { AddCircleIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { RichTextPreview } from '@pleadli/rich-text'
import { DataTable, selectColumn, type DataTableColumnDef } from '@pleadli/forms-tables'
import { Button } from '@pleadli/ui/button'
import { cn } from '@pleadli/ui/lib/utils'
import { createFileRoute } from '@tanstack/react-router'
import { useMemo, useState } from 'react'

export const Route = createFileRoute('/_public/sd-log/')({
  loader: async ({ context }) => {
    await context.queryClient.query({ ...stationDiaryOptions(''), staleTime: 'static' })
  },
  component: RouteComponent,
})

function RouteComponent() {
  const [addOpen, setAddOpen] = useState(false)
  const [editingEntry, setEditingEntry] = useState<StationDiaryEntry | null>(null)
  const { data: entries } = useStationDiaryEntries('')

  const columns: DataTableColumnDef<StationDiaryEntry>[] = useMemo(() => {
    return [
      selectColumn(),
      {
        accessorKey: 'id',
        header: 'ID',
        cell: ({ row }) => (
          <span
            className={cn('rounded-md bg-primary/15 px-3 py-1 text-xs', 'cursor-pointer')}
            onClick={() => setEditingEntry(row.original)}
          >
            {row.original.id}
          </span>
        ),
      },
      {
        accessorKey: 'category',
        header: 'Category',
        cell: ({ getValue }) => stationDiaryCategoryLabel(getValue<string>()),
      },
      {
        accessorKey: 'content',
        header: 'Entry',
        cell: ({ getValue }) => (
          <RichTextPreview value={getValue<string>()} className="line-clamp-2 max-w-sm" />
        ),
      },
      {
        id: 'relatedPerson',
        accessorFn: (row) => stationDiaryRelatedPersonName(row) ?? '',
        header: 'Related person',
        cell: ({ getValue }) => getValue<string>() || '—',
      },
      {
        accessorKey: 'createdAt',
        header: 'Logged',
        cell: ({ getValue }) => new Date(getValue<number>()).toLocaleString(),
      },
    ]
  }, [])

  return (
    <article className="container flex flex-col gap-5 pt-5 pb-20">
      <section className="flex items-center gap-4">
        <div className="flex flex-col">
          <div className="flex items-center gap-5">
            <h1>Station Diary</h1>

            <Createpanel
              open={addOpen}
              onOpenChange={setAddOpen}
              trigger={
                <Button size="sm">
                  <HugeiconsIcon icon={AddCircleIcon} />
                  New entry
                </Button>
              }
              headings={{
                title: 'New station diary entry',
                description: "Log what happened. This doesn't have to become an incident.",
              }}
            >
              <StationDiaryEntryForm onSuccess={() => setAddOpen(false)} />
            </Createpanel>
          </div>
          <p className="md:max-w-sm">
            Station activity, logged as it happens. Most entries stay informational.
          </p>
        </div>
      </section>

      <Createpanel
        open={editingEntry !== null}
        onOpenChange={(open) => {
          if (!open) setEditingEntry(null)
        }}
        headings={{
          title: 'Edit station diary entry',
          description: 'Update what was logged.',
        }}
      >
        {editingEntry && (
          <StationDiaryEntryForm
            key={editingEntry.id}
            entry={editingEntry}
            onSuccess={() => setEditingEntry(null)}
          />
        )}
      </Createpanel>

      <DataTable
        aria-label="Station Diary"
        data={entries}
        columns={columns}
        getRowId={(row) => row.id}
        emptyMessage="No entries logged yet."
        searchPlaceholder="Search the station diary…"
      />
    </article>
  )
}
