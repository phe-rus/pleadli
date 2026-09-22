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
import { format } from 'date-fns/format'
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
      {compliance.isOverdue ? `${hours}h overdue` : `${hours}h left`}
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
      { accessorKey: 'personId', header: 'Person ID' },
      {
        id: 'person',
        accessorFn: (row) => custodyPersonName(row),
        header: 'Person',
      },
      { accessorKey: 'personFirstName', header: 'First name' },
      { accessorKey: 'personLastName', header: 'Last name' },
      {
        accessorKey: 'personOtherNames',
        header: 'Other names',
        cell: ({ row }) => row.original.personOtherNames ?? '·',
      },
      { accessorKey: 'incidentId', header: 'Incident ID', cell: ({ row }) => row.original.incidentId ?? '·' },
      { accessorKey: 'caseId', header: 'Case ID', cell: ({ row }) => row.original.caseId ?? '·' },
      {
        accessorKey: 'caseReference',
        header: 'Case',
        cell: ({ row }) => row.original.caseReference ?? '·',
      },
      {
        accessorKey: 'location',
        header: 'Location',
        cell: ({ row }) => row.original.location ?? '·',
      },
      {
        accessorKey: 'arrestedAt',
        header: 'Arrested',
        cell: ({ getValue }) => format(getValue<number>(), 'PPp'),
      },
      {
        accessorKey: 'crossJurisdictionTransfer',
        header: 'Cross-jurisdiction',
        cell: ({ row }) => (row.original.crossJurisdictionTransfer ? 'Yes' : 'No'),
      },
      {
        accessorKey: 'transferredAt',
        header: 'Transferred',
        cell: ({ row }) => (row.original.transferredAt ? format(row.original.transferredAt, 'PPp') : '·'),
      },
      {
        accessorKey: 'status',
        header: 'Status',
        cell: ({ row }) => custodyStatusLabel(row.original.status),
      },
      {
        id: 'compliance',
        header: '48h status',
        cell: ({ row }) => <ComplianceBadge record={row.original} />,
      },
      {
        accessorKey: 'releasedAt',
        header: 'Released',
        cell: ({ row }) => (row.original.releasedAt ? format(row.original.releasedAt, 'PPp') : '·'),
      },
      { accessorKey: 'notes', header: 'Notes', cell: ({ row }) => row.original.notes ?? '·' },
      {
        accessorKey: 'createdAt',
        header: 'Recorded',
        cell: ({ getValue }) => format(getValue<number>(), 'PPp'),
      },
    ]
  }, [])

  return (
    <article className="page">
      <header className="page-header">
        <div>
          <h1>Custody</h1>
          <p>Who is in the cells, soonest limit first. Each limit is worked out from the arrest time when this page is drawn, never stored, so it cannot drift out of date.</p>
        </div>
        <div className="page-actions">
          <Createpanel
            open={addOpen}
            onOpenChange={setAddOpen}
            isDirty={addDirty}
            trigger={
              <Button size="sm">
                <HugeiconsIcon icon={AddCircleIcon} />
                New custody record
              </Button>
            }
            headings={{ title: 'New custody record', description: 'Log an arrest and start the 48-hour clock.' }}
          >
            <CustodyRecordForm onSuccess={() => setAddOpen(false)} onDirtyChange={setAddDirty} />
          </Createpanel>
        </div>
      </header>

      <section aria-labelledby="in-cells" className="page-section">
        <h2 id="in-cells">In the cells now</h2>
        <CustodyBoard records={records} onOpen={setEditing} />
      </section>

      <Createpanel
        open={editing !== null}
        onOpenChange={(open) => {
          if (!open) setEditing(null)
        }}
        isDirty={editDirty}
        headings={{ title: 'Edit custody record', description: 'Update this custody record.' }}
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
        <h2 id="all-records">All custody records</h2>
      <DataTable
        aria-label="Custody records"
        data={records}
        columns={columns}
        getRowId={(row) => row.id}
        emptyMessage="No custody records yet."
        searchPlaceholder="Search custody records"
      />
      </section>
    </article>
  )
}
