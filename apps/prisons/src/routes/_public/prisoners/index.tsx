import {
  admissionInstrumentLabel,
  custodyStatusLabel,
  pendingDocumentTypeLabel,
  prisonerFullName,
  prisonerStatusLabel,
  prisonersOptions,
  usePrisoners,
  type Prisoner,
} from '@/features/prisoners'
import { UniformChip } from '@/features/numbering'
import { PrisonerAvatar } from '@/features/prisoners/prisoner-avatar'
import { AddCircleIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { DataTable, selectColumn, type DataTableColumnDef } from '@pleadli/forms-tables'
import { Badge } from '@pleadli/ui/badge'
import { buttonVariants } from '@pleadli/ui/button'
import { cn } from '@pleadli/ui/lib/utils'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { format } from 'date-fns/format'
import { useEffect, useMemo } from 'react'

export const Route = createFileRoute('/_public/prisoners/')({
  validateSearch: (search: Record<string, unknown>): { open?: string } =>
    typeof search.open === 'string' ? { open: search.open } : {},
  loader: async ({ context }) => {
    await context.queryClient.query({ ...prisonersOptions(''), staleTime: 'static' })
  },
  component: RouteComponent,
})

/**
 * Prisoners has its own detail route ($prisonerId, the custody/remand/
 * release/documents workspace) rather than an in-place drawer: a deep
 * link with ?open= redirects straight there, same pattern DPP's Files
 * list uses.
 */
function RouteComponent() {
  const { open: openId } = Route.useSearch()
  const navigate = useNavigate()
  const { data: prisoners } = usePrisoners('')

  useEffect(() => {
    if (openId) {
      navigate({ to: '/prisoners/$prisonerId', params: { prisonerId: openId } })
    }
  }, [openId, navigate])

  const columns: DataTableColumnDef<Prisoner>[] = useMemo(() => {
    return [
      selectColumn(),
      {
        accessorKey: 'id',
        header: 'ID',
        cell: ({ row }) => (
          <Link
            to="/prisoners/$prisonerId"
            params={{ prisonerId: row.original.id }}
            className={cn('rounded-md bg-primary/15 px-3 py-1 text-xs', 'inline-block')}
          >
            {row.original.id}
          </Link>
        ),
      },
      {
        id: 'name',
        accessorFn: (row) => prisonerFullName(row),
        header: 'Name',
        cell: ({ row }) => (
          <Link to="/prisoners/$prisonerId" params={{ prisonerId: row.original.id }} className="flex items-center gap-2.5">
            <PrisonerAvatar prisonerId={row.original.id} name={prisonerFullName(row.original)} size={32} className="rounded-md" />
            <span className="font-medium">{prisonerFullName(row.original)}</span>
          </Link>
        ),
      },
      {
        id: 'prisonerNumber',
        accessorFn: (row) => row.prisonerNumber ?? row.id,
        header: 'Prisoner number',
        cell: ({ row }) => <span className="font-mono text-xs">{row.original.prisonerNumber ?? row.original.id}</span>,
      },
      { accessorKey: 'otherNames', header: 'Other names', cell: ({ row }) => row.original.otherNames ?? '·' },
      { accessorKey: 'nationalId', header: 'National ID', cell: ({ row }) => row.original.nationalId ?? '·' },
      { accessorKey: 'reference', header: 'Reference', cell: ({ row }) => row.original.reference ?? '·' },
      {
        accessorKey: 'status',
        header: 'Category',
        cell: ({ row }) => (
          <span className="flex flex-wrap items-center gap-1.5">
            <Badge variant="secondary">{prisonerStatusLabel(row.original.status)}</Badge>
            <UniformChip status={row.original.status} />
          </span>
        ),
      },
      { accessorKey: 'offence', header: 'Offence', cell: ({ row }) => row.original.offence ?? '·' },
      {
        accessorKey: 'currentStatus',
        header: 'Custody status',
        cell: ({ getValue }) => <Badge variant="outline">{custodyStatusLabel(getValue<string>())}</Badge>,
      },
      {
        id: 'documentsPending',
        accessorFn: (row) => (row.documentsPending ? pendingDocumentTypeLabel(row.pendingDocumentType) ?? 'Documents' : ''),
        header: 'Documents',
        cell: ({ row }) =>
          row.original.documentsPending ? (
            <Badge variant="destructive">
              Pending{pendingDocumentTypeLabel(row.original.pendingDocumentType) ? ` · ${pendingDocumentTypeLabel(row.original.pendingDocumentType)}` : ''}
            </Badge>
          ) : (
            '·'
          ),
      },
      {
        accessorKey: 'admissionInstrumentType',
        header: 'Admission instrument',
        cell: ({ getValue }) => admissionInstrumentLabel(getValue<string>()),
      },
      { accessorKey: 'admissionAuthority', header: 'Admission authority', cell: ({ row }) => row.original.admissionAuthority ?? '·' },
      {
        accessorKey: 'highCourtOnlyOffence',
        header: 'High Court only',
        cell: ({ getValue }) => (getValue<boolean>() ? 'Yes' : 'No'),
      },
      { accessorKey: 'currentLocation', header: 'Location', cell: ({ row }) => row.original.currentLocation ?? '·' },
      { accessorKey: 'admittedAt', header: 'Admitted', cell: ({ getValue }) => format(getValue<number>(), 'PPp') },
      { accessorKey: 'createdAt', header: 'Recorded', cell: ({ getValue }) => format(getValue<number>(), 'PPp') },
    ]
  }, [])

  return (
    <article className="page">
      <header className="page-header">
        <div>
          <h1>Population</h1>
          <p className="md:max-w-md">Everyone this facility holds or has held. Search by name, number, reference or national ID.</p>
        </div>
        <div className="page-actions">
          <Link to="/procedures/reception" className={buttonVariants({ size: 'sm' })}>
            <HugeiconsIcon icon={AddCircleIcon} />
            Receive someone
          </Link>
        </div>
      </header>

      <DataTable
        aria-label="Prisoners"
        data={prisoners}
        columns={columns}
        getRowId={(row) => row.id}
        emptyMessage="No prisoners admitted yet."
        searchPlaceholder="Search prisoners…"
      />
    </article>
  )
}
