import { Createpanel } from '@/components/create-panel'
import { exhibitPersonName, exhibitsOptions, exhibitStatusLabel, ExhibitForm, useExhibits, type Exhibit } from '@/features/evidence'
import { useDeepLinkRecord } from '@/hooks/use-deep-link-record'
import { AddCircleIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { DataTable, selectColumn, type DataTableColumnDef } from '@pleadli/forms-tables'
import { Button } from '@pleadli/ui/button'
import { cn } from '@pleadli/ui/lib/utils'
import { createFileRoute } from '@tanstack/react-router'
import { format } from 'date-fns/format'
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
        accessorKey: 'identificationMark',
        header: 'ID mark',
        cell: ({ row }) => row.original.identificationMark ?? '·',
      },
      { accessorKey: 'caseId', header: 'Case ID', cell: ({ row }) => row.original.caseId ?? '·' },
      {
        accessorKey: 'caseReference',
        header: 'Case',
        cell: ({ row }) => row.original.caseReference ?? '·',
      },
      { accessorKey: 'incidentId', header: 'Incident ID', cell: ({ row }) => row.original.incidentId ?? '·' },
      { accessorKey: 'personId', header: 'Person ID', cell: ({ row }) => row.original.personId ?? '·' },
      {
        id: 'person',
        accessorFn: (row) => exhibitPersonName(row) ?? '',
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
        accessorKey: 'recoveredAt',
        header: 'Recovered',
        cell: ({ getValue }) => format(getValue<number>(), 'PPp'),
      },
      {
        accessorKey: 'recoveredFromLocation',
        header: 'Recovered from',
        cell: ({ row }) => row.original.recoveredFromLocation ?? '·',
      },
      {
        accessorKey: 'handedOverBy',
        header: 'Handed over by',
        cell: ({ row }) => row.original.handedOverBy ?? '·',
      },
      { accessorKey: 'witnesses', header: 'Witnesses', cell: ({ row }) => row.original.witnesses ?? '·' },
      {
        accessorKey: 'receivingOfficerName',
        header: 'Receiving officer',
        cell: ({ row }) => row.original.receivingOfficerName ?? '·',
      },
      {
        accessorKey: 'storageLocation',
        header: 'Storage',
        cell: ({ row }) => row.original.storageLocation ?? '·',
      },
      {
        accessorKey: 'status',
        header: 'Status',
        cell: ({ row }) => exhibitStatusLabel(row.original.status),
      },
      { accessorKey: 'notes', header: 'Notes', cell: ({ row }) => row.original.notes ?? '·' },
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
            <h1>Evidence &amp; Exhibits</h1>

            <Createpanel
              open={addOpen}
              onOpenChange={setAddOpen}
              isDirty={addDirty}
              trigger={
                <Button size="sm">
                  <HugeiconsIcon icon={AddCircleIcon} />
                  Log exhibit
                </Button>
              }
              headings={{ title: 'Log exhibit', description: 'Record an item recovered, with its chain of custody.' }}
            >
              <ExhibitForm onSuccess={() => setAddOpen(false)} onDirtyChange={setAddDirty} />
            </Createpanel>
          </div>
          <p className="md:max-w-sm">
            Exhibit identity and traceability. Distinct from Stores/Armory, which is station equipment, not case
            evidence.
          </p>
        </div>
      </section>

      <Createpanel
        open={editing !== null}
        onOpenChange={(open) => {
          if (!open) setEditing(null)
        }}
        isDirty={editDirty}
        headings={{ title: 'Edit exhibit', description: 'Update this exhibit and its custody log.' }}
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
        aria-label="Exhibits"
        data={exhibits}
        columns={columns}
        getRowId={(row) => row.id}
        emptyMessage="No exhibits logged yet."
        searchPlaceholder="Search exhibits by description, ID mark, or storage location…"
      />
    </article>
  )
}
