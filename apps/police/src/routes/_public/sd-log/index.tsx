import { diaryCitation } from '@/features/registers'
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
import { useDeepLinkRecord } from '@/hooks/use-deep-link-record'
import { createFileRoute } from '@tanstack/react-router'
import { format } from 'date-fns/format'
import { useMemo, useState } from 'react'

export const Route = createFileRoute('/_public/sd-log/')({
  validateSearch: (search: Record<string, unknown>): { open?: string } =>
    typeof search.open === 'string' ? { open: search.open } : {},
  loader: async ({ context }) => {
    await context.queryClient.query({ ...stationDiaryOptions(''), staleTime: 'static' })
  },
  component: RouteComponent,
})

function RouteComponent() {
  const { open: openId } = Route.useSearch()
  const [addOpen, setAddOpen] = useState(false)
  const [addDirty, setAddDirty] = useState(false)
  const [editingEntry, setEditingEntry] = useState<StationDiaryEntry | null>(null)
  const [editDirty, setEditDirty] = useState(false)
  const { data: entries } = useStationDiaryEntries('')
  useDeepLinkRecord(entries, openId, setEditingEntry)

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
      { accessorKey: 'personId', header: 'Person ID', cell: ({ row }) => row.original.personId ?? '·' },
      {
        id: 'relatedPerson',
        accessorFn: (row) => stationDiaryRelatedPersonName(row) ?? '',
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
      {
        id: 'entry',
        accessorFn: (row) => diaryCitation(row) ?? '',
        header: 'Entry',
        cell: ({ row }) => diaryCitation(row.original) ?? '·',
      },
      {
        accessorKey: 'createdAt',
        header: 'Logged',
        cell: ({ getValue }) => format(getValue<number>(), 'PPp'),
      },
    ]
  }, [])

  return (
    <article className="page">
      <section className="flex items-center gap-4">
        <div className="flex flex-col">
          <div className="flex items-center gap-5">
            <h1>Station Diary</h1>

            <Createpanel
              open={addOpen}
              onOpenChange={setAddOpen}
              isDirty={addDirty}
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
              <StationDiaryEntryForm onSuccess={() => setAddOpen(false)} onDirtyChange={setAddDirty} />
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
        isDirty={editDirty}
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
            onDirtyChange={setEditDirty}
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
