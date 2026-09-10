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
        header: 'ID',
        cell: ({ row }) => (
          <span
            className={cn('rounded-md bg-primary/15 px-3 py-1 text-xs', 'cursor-pointer')}
            onClick={() => setEditingIncident(row.original)}
          >
            {row.original.id}
          </span>
        ),
      },
      { accessorKey: 'summary', header: 'Summary' },
      {
        accessorKey: 'description',
        header: 'Description',
        cell: ({ getValue }) => (
          <RichTextPreview value={getValue<string>()} className="line-clamp-2 max-w-sm" />
        ),
      },
      {
        accessorKey: 'location',
        header: 'Location',
        cell: ({ row }) => row.original.location ?? '·',
      },
      {
        id: 'relatedPerson',
        accessorFn: (row) => incidentPersonName(row) ?? '',
        header: 'Related person',
        cell: ({ getValue }) => getValue<string>() || '·',
      },
      {
        accessorKey: 'occurredAt',
        header: 'Occurred',
        cell: ({ getValue }) => new Date(getValue<number>()).toLocaleString(),
      },
    ]
  }, [])

  return (
    <article className="container flex flex-col gap-5 pt-5 pb-20">
      <section className="flex items-center gap-4">
        <div className="flex flex-col">
          <div className="flex items-center gap-5">
            <h1>Incidents</h1>

            <Createpanel
              open={addOpen}
              onOpenChange={setAddOpen}
              isDirty={addDirty}
              trigger={
                <Button size="sm">
                  <HugeiconsIcon icon={AddCircleIcon} />
                  Record incident
                </Button>
              }
              headings={{
                title: 'Record incident',
                description: 'What happened, when, and where.',
              }}
            >
              <IncidentForm onSuccess={() => setAddOpen(false)} onDirtyChange={setAddDirty} />
            </Createpanel>
          </div>
          <p className="md:max-w-sm">Something that happened or was reported.</p>
        </div>
      </section>

      <Createpanel
        open={editingIncident !== null}
        onOpenChange={(open) => {
          if (!open) setEditingIncident(null)
        }}
        isDirty={editDirty}
        headings={{ title: 'Edit incident', description: 'Update what was recorded.' }}
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
        aria-label="Incidents"
        data={incidents}
        columns={columns}
        getRowId={(row) => row.id}
        emptyMessage="No incidents recorded yet."
        searchPlaceholder="Search incidents…"
      />
    </article>
  )
}
