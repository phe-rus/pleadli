import { daysInCustody, mandatoryBailThresholdDays, prisonerFullName } from '@/features/prisoners'
import { DataTable, type DataTableColumnDef } from '@pleadli/forms-tables'
import { Badge } from '@pleadli/ui/badge'
import { cn } from '@pleadli/ui/lib/utils'
import { Link } from '@tanstack/react-router'
import { format } from 'date-fns/format'
import { useMemo } from 'react'
import { useRemandList } from './queries'
import type { RemandListEntry } from './schema'

/** Prisons Act s.118's pre-session list: admission date, authority for
 * detention, and the date last appeared in court, derived from the diary. */
export function RemandList() {
  const { data: remand } = useRemandList()

  const columns: DataTableColumnDef<RemandListEntry>[] = useMemo(
    () => [
      {
        accessorKey: 'prisonerId',
        header: 'Prisoner ID',
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
        header: 'Name',
      },
      { accessorKey: 'admissionAuthority', header: 'Authority for detention', cell: ({ row }) => row.original.admissionAuthority ?? '·' },
      { accessorKey: 'admittedAt', header: 'Admitted', cell: ({ getValue }) => format(getValue<number>(), 'PP') },
      {
        id: 'lastAppeared',
        header: 'Last appeared in court',
        cell: ({ row }) => (row.original.lastProducedAt ? format(row.original.lastProducedAt, 'PP') : 'Never produced'),
      },
      { id: 'daysInCustody', header: 'Days in custody', cell: ({ row }) => daysInCustody(row.original.admittedAt) },
      {
        id: 'threshold',
        header: 'Mandatory-bail threshold',
        cell: ({ row }) => {
          const threshold = mandatoryBailThresholdDays(row.original.highCourtOnlyOffence)
          const held = daysInCustody(row.original.admittedAt)
          return <Badge variant={held >= threshold ? 'destructive' : 'outline'}>{threshold} days</Badge>
        },
      },
    ],
    [],
  )

  return (
    <DataTable
      aria-label="Remand list"
      data={remand}
      columns={columns}
      getRowId={(row) => row.prisonerId}
      emptyMessage="No one is currently on remand."
      searchPlaceholder="Search the s.118 list…"
    />
  )
}
