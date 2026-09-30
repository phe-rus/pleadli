import * as m from '@/paraglide/messages'
import { Createpanel } from '@/components/create-panel'
import { exhibitPersonName, exhibitsOptions, exhibitStatusLabel, ExhibitForm, useExhibits, type Exhibit } from '@/features/evidence'
import { useDeepLinkRecord } from '@/hooks/use-deep-link-record'
import { AddCircleIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { DataTable, selectColumn, type DataTableColumnDef } from '@pleadli/forms-tables'
import { Button } from '@pleadli/ui/button'
import { cn } from '@pleadli/ui/lib/utils'
import { createFileRoute } from '@tanstack/react-router'
import { format } from '@/lib/date'
import { useMemo, useState } from 'react'

export const Route = createFileRoute('/_public/evidence/')({
  validateSearch: (search: Record<string, unknown>): { open?: string } =>
    typeof search.open === 'string' ? { open: search.open } : {},
  loader: async ({ context }) => {
    await context.queryClient.query({ ...exhibitsOptions(''), staleTime: 'static' })
  },
  component: RouteComponent,
})

function RouteComponent() {
  const { open: openId } = Route.useSearch()
  const [addOpen, setAddOpen] = useState(false)
  const [addDirty, setAddDirty] = useState(false)
  const [editing, setEditing] = useState<Exhibit | null>(null)
  const [editDirty, setEditDirty] = useState(false)
  const { data: exhibits } = useExhibits('')
  useDeepLinkRecord(exhibits, openId, setEditing)

  const columns: DataTableColumnDef<Exhibit>[] = useMemo(() => {
    return [
      selectColumn(),
      {
        accessorKey: 'id',
        header: m["col.id"](),
        cell: ({ row }) => (
          <span
            className={cn('rounded-md bg-primary/15 px-3 py-1 text-xs', 'cursor-pointer')}
            onClick={() => setEditing(row.original)}
          >
            {row.original.id}
          </span>
        ),
      },
      { accessorKey: 'description', header: m["col.description"]() },
      {
        accessorKey: 'identificationMark',
        header: m["col.id_mark"](),
        cell: ({ row }) => row.original.identificationMark ?? '·',
      },
      { accessorKey: 'caseId', header: m["col.case_id"](), cell: ({ row }) => row.original.caseId ?? '·' },
      {
        accessorKey: 'caseReference',
        header: m["col.case"](),
        cell: ({ row }) => row.original.caseReference ?? '·',
      },
      { accessorKey: 'incidentId', header: m["col.incident_id"](), cell: ({ row }) => row.original.incidentId ?? '·' },
      { accessorKey: 'personId', header: m["col.person_id"](), cell: ({ row }) => row.original.personId ?? '·' },
      {
        id: 'person',
        accessorFn: (row) => exhibitPersonName(row) ?? '',
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
        accessorKey: 'recoveredAt',
        header: m["col.recovered"](),
        cell: ({ getValue }) => format(getValue<number>(), 'PPp'),
      },
      {
        accessorKey: 'recoveredFromLocation',
        header: m["col.recovered_from"](),
        cell: ({ row }) => row.original.recoveredFromLocation ?? '·',
      },
      {
        accessorKey: 'handedOverBy',
        header: m["col.handed_over_by"](),
        cell: ({ row }) => row.original.handedOverBy ?? '·',
      },
      { accessorKey: 'witnesses', header: m["col.witnesses"](), cell: ({ row }) => row.original.witnesses ?? '·' },
      {
        accessorKey: 'receivingOfficerName',
        header: m["col.receiving_officer"](),
        cell: ({ row }) => row.original.receivingOfficerName ?? '·',
      },
      {
        accessorKey: 'storageLocation',
        header: m["col.storage"](),
        cell: ({ row }) => row.original.storageLocation ?? '·',
      },
      {
        accessorKey: 'status',
        header: m["col.status"](),
        cell: ({ row }) => exhibitStatusLabel(row.original.status),
      },
      { accessorKey: 'notes', header: m["col.notes"](), cell: ({ row }) => row.original.notes ?? '·' },
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
            <h1>{m["evidence_page.title"]()}</h1>

            <Createpanel
              open={addOpen}
              onOpenChange={setAddOpen}
              isDirty={addDirty}
              trigger={
                <Button size="sm">
                  <HugeiconsIcon icon={AddCircleIcon} />
                  {m["evidence.submit"]()}
                </Button>
              }
              headings={{ title: m["evidence.submit"](), description: m["evidence_page.add_desc"]() }}
            >
              <ExhibitForm onSuccess={() => setAddOpen(false)} onDirtyChange={setAddDirty} />
            </Createpanel>
          </div>
          <p className="md:max-w-sm">
            {m["evidence_page.lead"]()}
          </p>
        </div>
      </section>

      <Createpanel
        open={editing !== null}
        onOpenChange={(open) => {
          if (!open) setEditing(null)
        }}
        isDirty={editDirty}
        headings={{ title: m["evidence_page.edit_title"](), description: m["evidence_page.edit_desc"]() }}
      >
        {editing && (
          <ExhibitForm
            key={editing.id}
            exhibit={editing}
            onSuccess={() => setEditing(null)}
            onDirtyChange={setEditDirty}
          />
        )}
      </Createpanel>

      <DataTable
        aria-label={m["evidence_page.table"]()}
        data={exhibits}
        columns={columns}
        getRowId={(row) => row.id}
        emptyMessage={m["evidence_page.empty"]()}
        searchPlaceholder={m["evidence_page.search"]()}
      />
    </article>
  )
}
