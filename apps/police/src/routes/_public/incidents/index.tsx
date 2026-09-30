import * as m from '@/paraglide/messages'
import { Createpanel } from '@/components/create-panel'
import {
  incidentPersonName,
  incidentsOptions,
  IncidentForm,
  useIncidents,
  type Incident,
} from '@/features/incidents'
import { RichTextPreview } from '@pleadli/rich-text'
import { AddCircleIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { DataTable, selectColumn, type DataTableColumnDef } from '@pleadli/forms-tables'
import { Button } from '@pleadli/ui/button'
import { cn } from '@pleadli/ui/lib/utils'
import { useDeepLinkRecord } from '@/hooks/use-deep-link-record'
import { createFileRoute } from '@tanstack/react-router'
import { format } from '@/lib/date'
import { useMemo, useState } from 'react'

export const Route = createFileRoute('/_public/incidents/')({
  validateSearch: (search: Record<string, unknown>): { open?: string } =>
    typeof search.open === 'string' ? { open: search.open } : {},
  loader: async ({ context }) => {
    await context.queryClient.query({ ...incidentsOptions(''), staleTime: 'static' })
  },
  component: RouteComponent,
})

function RouteComponent() {
  const { open: openId } = Route.useSearch()
  const [addOpen, setAddOpen] = useState(false)
  const [addDirty, setAddDirty] = useState(false)
  const [editingIncident, setEditingIncident] = useState<Incident | null>(null)
  const [editDirty, setEditDirty] = useState(false)
  const { data: incidents } = useIncidents('')
  useDeepLinkRecord(incidents, openId, setEditingIncident)

  const columns: DataTableColumnDef<Incident>[] = useMemo(() => {
    return [
      selectColumn(),
      {
        accessorKey: 'id',
        header: m["col.id"](),
        cell: ({ row }) => (
          <span
            className={cn('rounded-md bg-primary/15 px-3 py-1 text-xs', 'cursor-pointer')}
            onClick={() => setEditingIncident(row.original)}
          >
            {row.original.id}
          </span>
        ),
      },
      { accessorKey: 'summary', header: m["col.summary"]() },
      {
        accessorKey: 'description',
        header: m["col.description"](),
        cell: ({ getValue }) => (
          <RichTextPreview value={getValue<string>()} className="line-clamp-2 max-w-sm" />
        ),
      },
      {
        accessorKey: 'location',
        header: m["col.location"](),
        cell: ({ row }) => row.original.location ?? '·',
      },
      { accessorKey: 'personId', header: m["col.person_id"](), cell: ({ row }) => row.original.personId ?? '·' },
      {
        id: 'relatedPerson',
        accessorFn: (row) => incidentPersonName(row) ?? '',
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
        accessorKey: 'stationDiaryEntryId',
        header: m["col.sd_entry_id"](),
        cell: ({ row }) => row.original.stationDiaryEntryId ?? '·',
      },
      {
        accessorKey: 'occurredAt',
        header: m["col.occurred"](),
        cell: ({ getValue }) => format(getValue<number>(), 'PPp'),
      },
      {
        accessorKey: 'createdAt',
        header: m["col.recorded"](),
        cell: ({ getValue }) => format(getValue<number>(), 'PPp'),
      },
    ]
  }, [])

  return (
    <article className="page">
      <section className="flex items-center gap-4">
        <div className="flex flex-col">
          <div className="flex items-center gap-5">
            <h1>{m["nav.incidents"]()}</h1>

            <Createpanel
              open={addOpen}
              onOpenChange={setAddOpen}
              isDirty={addDirty}
              trigger={
                <Button size="sm">
                  <HugeiconsIcon icon={AddCircleIcon} />
                  {m["incidents.submit"]()}
                </Button>
              }
              headings={{
                title: m["incidents.submit"](),
                description: m["incidents_page.add_desc"](),
              }}
            >
              <IncidentForm onSuccess={() => setAddOpen(false)} onDirtyChange={setAddDirty} />
            </Createpanel>
          </div>
          <p className="md:max-w-sm">{m["incidents_page.lead"]()}</p>
        </div>
      </section>

      <Createpanel
        open={editingIncident !== null}
        onOpenChange={(open) => {
          if (!open) setEditingIncident(null)
        }}
        isDirty={editDirty}
        headings={{ title: m["incidents_page.edit_title"](), description: m["incidents_page.edit_desc"]() }}
      >
        {editingIncident && (
          <IncidentForm
            key={editingIncident.id}
            incident={editingIncident}
            onSuccess={() => setEditingIncident(null)}
            onDirtyChange={setEditDirty}
          />
        )}
      </Createpanel>

      <DataTable
        aria-label={m["nav.incidents"]()}
        data={incidents}
        columns={columns}
        getRowId={(row) => row.id}
        emptyMessage={m["incidents_page.empty"]()}
        searchPlaceholder={m["incidents_page.search"]()}
      />
    </article>
  )
}
