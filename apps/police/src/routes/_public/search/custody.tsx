import * as m from '@/paraglide/messages'
import { Createpanel } from '@/components/create-panel'
import {
  custodyCompliance,
  custodyPersonName,
  custodyRecordsOptions,
  custodyStatusLabel,
  CustodyBoard,
  CustodyRecordForm,
  useCustodyRecords,
  type CustodyRecord,
} from '@/features/custody'
import { AddCircleIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { DataTable, selectColumn, type DataTableColumnDef } from '@pleadli/forms-tables'
import { Badge } from '@pleadli/ui/badge'
import { Button } from '@pleadli/ui/button'
import { cn } from '@pleadli/ui/lib/utils'
import { useDeepLinkRecord } from '@/hooks/use-deep-link-record'
import { createFileRoute } from '@tanstack/react-router'
import { format } from '@/lib/date'
import { useMemo, useState } from 'react'

export const Route = createFileRoute('/_public/search/custody')({
  validateSearch: (search: Record<string, unknown>): { open?: string } =>
    typeof search.open === 'string' ? { open: search.open } : {},
  loader: async ({ context }) => {
    await context.queryClient.query({ ...custodyRecordsOptions(''), staleTime: 'static' })
  },
  component: RouteComponent,
})

function ComplianceBadge({ record }: { record: CustodyRecord }) {
  if (record.status !== 'in_custody') return <span>·</span>
  const compliance = custodyCompliance(record)
  const hours = Math.abs(compliance.hoursRemaining).toFixed(1)
  return (
    <Badge variant={compliance.isOverdue ? 'destructive' : compliance.hoursRemaining < 6 ? 'default' : 'secondary'}>
      {compliance.isOverdue ? m["common.hours_overdue"]({ hours }) : m["investigation.hours_left"]({ hours })}
    </Badge>
  )
}

function RouteComponent() {
  const { open: openId } = Route.useSearch()
  const [addOpen, setAddOpen] = useState(false)
  const [addDirty, setAddDirty] = useState(false)
  const [editing, setEditing] = useState<CustodyRecord | null>(null)
  const [editDirty, setEditDirty] = useState(false)
  const { data: records } = useCustodyRecords('')
  useDeepLinkRecord(records, openId, setEditing)

  const columns: DataTableColumnDef<CustodyRecord>[] = useMemo(() => {
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
        accessorFn: (row) => custodyPersonName(row),
        header: m["col.person"](),
      },
      { accessorKey: 'personFirstName', header: m["col.first_name"]() },
      { accessorKey: 'personLastName', header: m["col.last_name"]() },
      {
        accessorKey: 'personOtherNames',
        header: m["col.other_names"](),
        cell: ({ row }) => row.original.personOtherNames ?? '·',
      },
      { accessorKey: 'incidentId', header: m["col.incident_id"](), cell: ({ row }) => row.original.incidentId ?? '·' },
      { accessorKey: 'caseId', header: m["col.case_id"](), cell: ({ row }) => row.original.caseId ?? '·' },
      {
        accessorKey: 'caseReference',
        header: m["col.case"](),
        cell: ({ row }) => row.original.caseReference ?? '·',
      },
      {
        accessorKey: 'location',
        header: m["col.location"](),
        cell: ({ row }) => row.original.location ?? '·',
      },
      {
        accessorKey: 'arrestedAt',
        header: m["col.arrested"](),
        cell: ({ getValue }) => format(getValue<number>(), 'PPp'),
      },
      {
        accessorKey: 'crossJurisdictionTransfer',
        header: m["col.cross_jurisdiction"](),
        cell: ({ row }) => (row.original.crossJurisdictionTransfer ? m["common.yes"]() : m["common.no"]()),
      },
      {
        accessorKey: 'transferredAt',
        header: m["col.transferred"](),
        cell: ({ row }) => (row.original.transferredAt ? format(row.original.transferredAt, 'PPp') : '·'),
      },
      {
        accessorKey: 'status',
        header: m["col.status"](),
        cell: ({ row }) => custodyStatusLabel(row.original.status),
      },
      {
        id: 'compliance',
        header: m["col.48h_status"](),
        cell: ({ row }) => <ComplianceBadge record={row.original} />,
      },
      {
        accessorKey: 'releasedAt',
        header: m["col.released"](),
        cell: ({ row }) => (row.original.releasedAt ? format(row.original.releasedAt, 'PPp') : '·'),
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
      <header className="page-header">
        <div>
          <h1>{m["common.custody"]()}</h1>
          <p>{m["custody_page.lead"]()}</p>
        </div>
        <div className="page-actions">
          <Createpanel
            open={addOpen}
            onOpenChange={setAddOpen}
            isDirty={addDirty}
            trigger={
              <Button size="sm">
                <HugeiconsIcon icon={AddCircleIcon} />
                {m["custody_page.new"]()}
              </Button>
            }
            headings={{ title: m["custody_page.new"](), description: m["custody_page.new_desc"]() }}
          >
            <CustodyRecordForm onSuccess={() => setAddOpen(false)} onDirtyChange={setAddDirty} />
          </Createpanel>
        </div>
      </header>

      <section aria-labelledby="in-cells" className="page-section">
        <h2 id="in-cells">{m["custody_page.in_cells"]()}</h2>
        <CustodyBoard records={records} onOpen={setEditing} />
      </section>

      <Createpanel
        open={editing !== null}
        onOpenChange={(open) => {
          if (!open) setEditing(null)
        }}
        isDirty={editDirty}
        headings={{ title: m["custody_page.edit_title"](), description: m["custody_page.edit_desc"]() }}
      >
        {editing && (
          <CustodyRecordForm
            key={editing.id}
            record={editing}
            onSuccess={() => setEditing(null)}
            onDirtyChange={setEditDirty}
          />
        )}
      </Createpanel>

      <section aria-labelledby="all-records" className="page-section">
        <h2 id="all-records">{m["custody_page.all"]()}</h2>
      <DataTable
        aria-label={m["custody_page.table"]()}
        data={records}
        columns={columns}
        getRowId={(row) => row.id}
        emptyMessage={m["custody_page.empty"]()}
        searchPlaceholder={m["custody_page.search"]()}
      />
      </section>
    </article>
  )
}
