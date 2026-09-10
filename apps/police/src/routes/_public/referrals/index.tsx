import { Createpanel } from '@/components/create-panel'
import {
  referralDestinationTypeLabel,
  referralsOptions,
  referralStatusLabel,
  ReferralForm,
  useReferrals,
  type Referral,
} from '@/features/referrals'
import { useDeepLinkRecord } from '@/hooks/use-deep-link-record'
import { AddCircleIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { DataTable, selectColumn, type DataTableColumnDef } from '@pleadli/forms-tables'
import { Badge } from '@pleadli/ui/badge'
import { Button } from '@pleadli/ui/button'
import { cn } from '@pleadli/ui/lib/utils'
import { createFileRoute } from '@tanstack/react-router'
import { format } from 'date-fns/format'
import { useMemo, useState } from 'react'

export const Route = createFileRoute('/_public/referrals/')({
  validateSearch: (search: Record<string, unknown>): { open?: string } =>
    typeof search.open === 'string' ? { open: search.open } : {},
  loader: async ({ context }) => {
    await context.queryClient.query({ ...referralsOptions(''), staleTime: 'static' })
  },
  component: RouteComponent,
})

function statusVariant(status: string): 'default' | 'secondary' | 'destructive' {
  if (status === 'accepted') return 'default'
  if (status === 'rejected') return 'destructive'
  return 'secondary'
}

function RouteComponent() {
  const { open: openId } = Route.useSearch()
  const [addOpen, setAddOpen] = useState(false)
  const [addDirty, setAddDirty] = useState(false)
  const [editing, setEditing] = useState<Referral | null>(null)
  const [editDirty, setEditDirty] = useState(false)
  const { data: referrals } = useReferrals('')
  useDeepLinkRecord(referrals, openId, setEditing)

  const columns: DataTableColumnDef<Referral>[] = useMemo(() => {
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
      { accessorKey: 'caseId', header: 'Case ID' },
      { accessorKey: 'caseReference', header: 'Case' },
      {
        accessorKey: 'destinationType',
        header: 'Destination type',
        cell: ({ getValue }) => referralDestinationTypeLabel(getValue<string>()),
      },
      {
        accessorKey: 'destinationName',
        header: 'Destination',
        cell: ({ row }) => row.original.destinationName ?? '·',
      },
      {
        accessorKey: 'status',
        header: 'Status',
        cell: ({ row }) => (
          <Badge variant={statusVariant(row.original.status)}>{referralStatusLabel(row.original.status)}</Badge>
        ),
      },
      {
        accessorKey: 'officerName',
        header: 'Referring officer',
        cell: ({ row }) => row.original.officerName ?? '·',
      },
      {
        accessorKey: 'referredAt',
        header: 'Referred',
        cell: ({ getValue }) => format(getValue<number>(), 'PPp'),
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
    <article className="container flex flex-col gap-5 pt-5 pb-20">
      <section className="flex items-center gap-4">
        <div className="flex flex-col">
          <div className="flex items-center gap-5">
            <h1>Referrals &amp; Dispatches</h1>

            <Createpanel
              open={addOpen}
              onOpenChange={setAddOpen}
              isDirty={addDirty}
              trigger={
                <Button size="sm">
                  <HugeiconsIcon icon={AddCircleIcon} />
                  Record referral
                </Button>
              }
              headings={{ title: 'Record referral', description: 'Hand a case to DPP, Courts, or another station.' }}
            >
              <ReferralForm onSuccess={() => setAddOpen(false)} onDirtyChange={setAddDirty} />
            </Createpanel>
          </div>
          <p className="md:max-w-sm">
            One workflow, not two: case handed elsewhere, tracked here. Emergency/operational dispatch is a
            different concern this app doesn't model.
          </p>
        </div>
      </section>

      <Createpanel
        open={editing !== null}
        onOpenChange={(open) => {
          if (!open) setEditing(null)
        }}
        isDirty={editDirty}
        headings={{ title: 'Edit referral', description: 'Update this referral.' }}
      >
        {editing && (
          <ReferralForm
            key={editing.id}
            referral={editing}
            onSuccess={() => setEditing(null)}
            onDirtyChange={setEditDirty}
          />
        )}
      </Createpanel>

      <DataTable
        aria-label="Referrals"
        data={referrals}
        columns={columns}
        getRowId={(row) => row.id}
        emptyMessage="No referrals recorded yet."
        searchPlaceholder="Search by case reference or destination…"
      />
    </article>
  )
}
