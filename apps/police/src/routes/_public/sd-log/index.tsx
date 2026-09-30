import * as m from '@/paraglide/messages'
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
import { format } from '@/lib/date'
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
        header: m["col.id"](),
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
        header: m["col.category"](),
        cell: ({ getValue }) => stationDiaryCategoryLabel(getValue<string>()),
      },
      {
        accessorKey: 'content',
        header: m["col.entry"](),
        cell: ({ getValue }) => (
          <RichTextPreview value={getValue<string>()} className="line-clamp-2 max-w-sm" />
        ),
      },
      { accessorKey: 'personId', header: m["col.person_id"](), cell: ({ row }) => row.original.personId ?? '·' },
      {
        id: 'relatedPerson',
        accessorFn: (row) => stationDiaryRelatedPersonName(row) ?? '',
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
      {
        id: 'entry',
        accessorFn: (row) => diaryCitation(row) ?? '',
        header: m["col.entry"](),
        cell: ({ row }) => diaryCitation(row.original) ?? '·',
      },
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
            <h1>{m["sd_page.title"]()}</h1>

            <Createpanel
              open={addOpen}
              onOpenChange={setAddOpen}
              isDirty={addDirty}
              trigger={
                <Button size="sm">
                  <HugeiconsIcon icon={AddCircleIcon} />
                  {m["sd_page.new_entry"]()}
                </Button>
              }
              headings={{
                title: m["overview.new_sd_title"](),
                description: m["sd_page.add_desc"](),
              }}
            >
              <StationDiaryEntryForm onSuccess={() => setAddOpen(false)} onDirtyChange={setAddDirty} />
            </Createpanel>
          </div>
          <p className="md:max-w-sm">
            {m["sd_page.lead"]()}
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
          title: m["sd_page.edit_title"](),
          description: m["sd_page.edit_desc"](),
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
        aria-label={m["sd_page.title"]()}
        data={entries}
        columns={columns}
        getRowId={(row) => row.id}
        emptyMessage={m["sd_page.empty"]()}
        searchPlaceholder={m["sd_page.search"]()}
      />
    </article>
  )
}
