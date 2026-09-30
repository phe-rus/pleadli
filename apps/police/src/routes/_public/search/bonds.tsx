import * as m from '@/paraglide/messages'
import { Createpanel } from '@/components/create-panel'
import { BondForm, bondPersonName, bondsOptions, bondStatusLabel, useBonds, type Bond } from '@/features/bonds'
import { AddCircleIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { DataTable, selectColumn, type DataTableColumnDef } from '@pleadli/forms-tables'
import { Button } from '@pleadli/ui/button'
import { cn } from '@pleadli/ui/lib/utils'
import { useDeepLinkRecord } from '@/hooks/use-deep-link-record'
import { createFileRoute } from '@tanstack/react-router'
import { format } from '@/lib/date'
import { useMemo, useState } from 'react'

export const Route = createFileRoute('/_public/search/bonds')({
  validateSearch: (search: Record<string, unknown>): { open?: string } =>
    typeof search.open === 'string' ? { open: search.open } : {},
  loader: async ({ context }) => {
    await context.queryClient.query({ ...bondsOptions(''), staleTime: 'static' })
  },
  component: RouteComponent,
})

function RouteComponent() {
  const { open: openId } = Route.useSearch()
  const [addOpen, setAddOpen] = useState(false)
  const [addDirty, setAddDirty] = useState(false)
  const [editing, setEditing] = useState<Bond | null>(null)
  const [editDirty, setEditDirty] = useState(false)
  const { data: bonds } = useBonds('')
  useDeepLinkRecord(bonds, openId, setEditing)

  const columns: DataTableColumnDef<Bond>[] = useMemo(() => {
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
      { accessorKey: 'personId', header: m["col.person_id"]() },
      {
        id: 'person',
        accessorFn: (row) => bondPersonName(row),
        header: m["col.person"](),
      },
      { accessorKey: 'personFirstName', header: m["col.first_name"]() },
      { accessorKey: 'personLastName', header: m["col.last_name"]() },
      {
        accessorKey: 'personOtherNames',
        header: m["col.other_names"](),
        cell: ({ row }) => row.original.personOtherNames ?? '·',
      },
      { accessorKey: 'custodyId', header: m["col.custody_id"](), cell: ({ row }) => row.original.custodyId ?? '·' },
      { accessorKey: 'caseId', header: m["col.case_id"](), cell: ({ row }) => row.original.caseId ?? '·' },
      {
        accessorKey: 'caseReference',
        header: m["col.case"](),
        cell: ({ row }) => row.original.caseReference ?? '·',
      },
      {
        accessorKey: 'lockUpSerialNumber',
        header: m["col.lock_up_serial_no"](),
        cell: ({ row }) => row.original.lockUpSerialNumber ?? '·',
      },
      {
        accessorKey: 'withSurety',
        header: m["col.surety"](),
        cell: ({ row }) => (row.original.withSurety ? row.original.suretyName ?? m["common.yes"]() : m["common.none"]()),
      },
      { accessorKey: 'suretyName', header: m["col.surety_name"](), cell: ({ row }) => row.original.suretyName ?? '·' },
      {
        accessorKey: 'suretyContact',
        header: m["col.surety_contact"](),
        cell: ({ row }) => row.original.suretyContact ?? '·',
      },
      {
        accessorKey: 'reportingSchedule',
        header: m["col.reporting"](),
        cell: ({ row }) => row.original.reportingSchedule ?? '·',
      },
      {
        id: 'grantingOfficer',
        accessorFn: (row) => [row.officerRank, row.officerName].filter(Boolean).join(' '),
        header: m["col.granting_officer"](),
        cell: ({ getValue }) => getValue<string>() || '·',
      },
      { accessorKey: 'officerName', header: m["col.officer_name"](), cell: ({ row }) => row.original.officerName ?? '·' },
      { accessorKey: 'officerRank', header: m["col.officer_rank"](), cell: ({ row }) => row.original.officerRank ?? '·' },
      {
        accessorKey: 'status',
        header: m["col.status"](),
        cell: ({ row }) => bondStatusLabel(row.original.status),
      },
      {
        accessorKey: 'grantedAt',
        header: m["col.granted"](),
        cell: ({ getValue }) => format(getValue<number>(), 'PPp'),
      },
      { accessorKey: 'notes', header: m["col.notes"](), cell: ({ row }) => row.original.notes ?? '·' },
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
            <h1>{m["bonds_page.title"]()}</h1>

            <Createpanel
              open={addOpen}
              onOpenChange={setAddOpen}
              isDirty={addDirty}
              trigger={
                <Button size="sm">
                  <HugeiconsIcon icon={AddCircleIcon} />
                  {m["bonds.submit"]()}
                </Button>
              }
              headings={{ title: m["bonds.submit"](), description: m["bonds_page.add_desc"]() }}
            >
              <BondForm onSuccess={() => setAddOpen(false)} onDirtyChange={setAddDirty} />
            </Createpanel>
          </div>
          <p className="md:max-w-sm">{m["bonds_page.lead"]()}</p>
        </div>
      </section>

      <Createpanel
        open={editing !== null}
        onOpenChange={(open) => {
          if (!open) setEditing(null)
        }}
        isDirty={editDirty}
        headings={{ title: m["bonds_page.edit_title"](), description: m["bonds_page.edit_desc"]() }}
      >
        {editing && (
          <BondForm
            key={editing.id}
            bond={editing}
            onSuccess={() => setEditing(null)}
            onDirtyChange={setEditDirty}
          />
        )}
      </Createpanel>

      <DataTable
        aria-label={m["bonds_page.table"]()}
        data={bonds}
        columns={columns}
        getRowId={(row) => row.id}
        emptyMessage={m["bonds_page.empty"]()}
        searchPlaceholder={m["bonds_page.search"]()}
      />
    </article>
  )
}
