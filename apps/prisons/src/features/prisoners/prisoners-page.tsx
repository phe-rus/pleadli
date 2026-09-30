import { admissionInstrumentLabel, custodyStatusLabel, pendingDocumentTypeLabel, prisonerFullName, prisonerStatusLabel, type Prisoner } from './schema'
import { usePrisoners } from './queries'
import { UniformChip } from '@/features/numbering'
import { PrisonerAvatar } from './prisoner-avatar'
import { AddCircleIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { DataTable, selectColumn, type DataTableColumnDef } from '@pleadli/forms-tables'
import { Badge } from '@pleadli/ui/badge'
import { buttonVariants } from '@pleadli/ui/button'
import { cn } from '@pleadli/ui/lib/utils'
import { Link, useNavigate } from '@tanstack/react-router'
import { format } from 'date-fns/format'
import { useEffect, useMemo } from 'react'
import { m } from '@/paraglide/messages'

/**
 * Prisoners has its own detail route ($prisonerId, the custody/remand/
 * release/documents workspace) rather than an in-place drawer: a deep
 * link with ?open= redirects straight there, same pattern DPP's Files
 * list uses.
 */
export function PrisonersPage({ openId }: { openId?: string }) {
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
        header: m.route_prisoners_name(),
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
        header: m.route_prisoners_prisoner_number(),
        cell: ({ row }) => <span className="font-mono text-xs">{row.original.prisonerNumber ?? row.original.id}</span>,
      },
      { accessorKey: 'otherNames', header: m.route_prisoners_other_names(), cell: ({ row }) => row.original.otherNames ?? '·' },
      { accessorKey: 'nationalId', header: m.route_prisoners_national_id(), cell: ({ row }) => row.original.nationalId ?? '·' },
      { accessorKey: 'reference', header: m.route_prisoners_reference(), cell: ({ row }) => row.original.reference ?? '·' },
      {
        accessorKey: 'status',
        header: m.route_prisoners_category(),
        cell: ({ row }) => (
          <span className="flex flex-wrap items-center gap-1.5">
            <Badge variant="secondary">{prisonerStatusLabel(row.original.status)}</Badge>
            <UniformChip status={row.original.status} />
          </span>
        ),
      },
      { accessorKey: 'offence', header: m.route_prisoners_offence(), cell: ({ row }) => row.original.offence ?? '·' },
      {
        accessorKey: 'currentStatus',
        header: m.route_prisoners_custody_status(),
        cell: ({ getValue }) => <Badge variant="outline">{custodyStatusLabel(getValue<string>())}</Badge>,
      },
      {
        id: 'documentsPending',
        accessorFn: (row) => (row.documentsPending ? pendingDocumentTypeLabel(row.pendingDocumentType) ?? m.route_prisoners_documents_fallback() : ''),
        header: m.route_prisoners_documents(),
        cell: ({ row }) =>
          row.original.documentsPending ? (
            <Badge variant="destructive">
              {pendingDocumentTypeLabel(row.original.pendingDocumentType) ? m.route_prisoners_pending_with({ type: pendingDocumentTypeLabel(row.original.pendingDocumentType) ?? '' }) : m.route_prisoners_pending()}
            </Badge>
          ) : (
            '·'
          ),
      },
      {
        accessorKey: 'admissionInstrumentType',
        header: m.route_prisoners_admission_instrument(),
        cell: ({ getValue }) => admissionInstrumentLabel(getValue<string>()),
      },
      { accessorKey: 'admissionAuthority', header: m.route_prisoners_admission_authority(), cell: ({ row }) => row.original.admissionAuthority ?? '·' },
      {
        accessorKey: 'highCourtOnlyOffence',
        header: m.route_prisoners_high_court_only(),
        cell: ({ getValue }) => (getValue<boolean>() ? m.route_prisoners_yes() : m.common_no()),
      },
      { accessorKey: 'currentLocation', header: m.route_prisoners_location(), cell: ({ row }) => row.original.currentLocation ?? '·' },
      { accessorKey: 'admittedAt', header: m.route_prisoners_admitted(), cell: ({ getValue }) => format(getValue<number>(), 'PPp') },
      { accessorKey: 'createdAt', header: m.route_prisoners_recorded(), cell: ({ getValue }) => format(getValue<number>(), 'PPp') },
    ]
  }, [])

  return (
    <article className="page">
      <header className="page-header">
        <div>
          <h1>{m.route_prisoners_population()}</h1>
          <p className="md:max-w-md">{m.route_prisoners_everyone_this_facility_holds_or_has()}</p>
        </div>
        <div className="page-actions">
          <Link to="/procedures/reception" className={buttonVariants({ size: 'sm' })}>
            <HugeiconsIcon icon={AddCircleIcon} />
            {m.route_prisoners_receive_someone()}
          </Link>
        </div>
      </header>

      <DataTable
        aria-label={m.route_prisoners_prisoners()}
        data={prisoners}
        columns={columns}
        getRowId={(row) => row.id}
        emptyMessage={m.route_prisoners_no_prisoners_admitted_yet()}
        searchPlaceholder={m.route_prisoners_search_prisoners()}
      />
    </article>
  )
}
