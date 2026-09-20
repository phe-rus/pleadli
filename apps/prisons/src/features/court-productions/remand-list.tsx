import { daysInCustody, mandatoryBailThresholdDays, prisonerFullName } from '@/features/prisoners'
import { DataTable, type DataTableColumnDef } from '@pleadli/forms-tables'
import { Badge } from '@pleadli/ui/badge'
import { cn } from '@pleadli/ui/lib/utils'
import { Link } from '@tanstack/react-router'
import { format } from 'date-fns/format'
import { useMemo } from 'react'
import { useRemandList } from './queries'
import type { RemandListEntry } from './schema'
import { m } from '@/paraglide/messages'

/** Prisons Act s.118's pre-session list: admission date, authority for
 * detention, and the date last appeared in court, derived from the diary. */
export function RemandList() {
  const { data: remand } = useRemandList()

  const columns: DataTableColumnDef<RemandListEntry>[] = useMemo(
    () => [
      {
        accessorKey: 'prisonerId',
        header: m.court_productions_prisoner_id(),
        cell: ({ row }) => (
          <Link
            to="/prisoners/$prisonerId"
            params={{ prisonerId: row.original.prisonerId }}
            className={cn('rounded-md bg-primary/15 px-3 py-1 text-xs', 'inline-block')}
          >
            {row.original.prisonerId}
          </Link>
        ),
      },
      {
        id: 'name',
        accessorFn: (row) => prisonerFullName({ firstName: row.firstName, lastName: row.lastName, otherNames: null }),
        header: m.court_productions_name(),
      },
      { accessorKey: 'admissionAuthority', header: m.court_productions_authority_for_detention(), cell: ({ row }) => row.original.admissionAuthority ?? '·' },
      { accessorKey: 'admittedAt', header: m.court_productions_admitted(), cell: ({ getValue }) => format(getValue<number>(), 'PP') },
      {
        id: 'lastAppeared',
        header: m.court_productions_last_appeared_in_court(),
        cell: ({ row }) => (row.original.lastProducedAt ? format(row.original.lastProducedAt, 'PP') : m.court_productions_never_produced()),
      },
      { id: 'daysInCustody', header: m.court_productions_days_in_custody(), cell: ({ row }) => daysInCustody(row.original.admittedAt) },
      {
        id: 'threshold',
        header: m.court_productions_mandatory_bail_threshold(),
        cell: ({ row }) => {
          const threshold = mandatoryBailThresholdDays(row.original.highCourtOnlyOffence)
          const held = daysInCustody(row.original.admittedAt)
          return <Badge variant={held >= threshold ? 'destructive' : 'outline'}>{m.court_productions_days({ threshold })}</Badge>
        },
      },
    ],
    [],
  )

  return (
    <DataTable
      aria-label={m.court_productions_remand_list()}
      data={remand}
      columns={columns}
      getRowId={(row) => row.prisonerId}
      emptyMessage={m.court_productions_no_one_is_currently_on_remand()}
      searchPlaceholder={m.court_productions_search_the_s_118_list()}
    />
  )
}
