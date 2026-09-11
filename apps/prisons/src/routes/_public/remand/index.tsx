import { mandatoryBailThresholdDays, daysInCustody, prisonerFullName } from '@/features/prisoners'
import { remandListOptions, useRemandList } from '@/features/court-productions'
import { DataTable, type DataTableColumnDef } from '@pleadli/forms-tables'
import { Badge } from '@pleadli/ui/badge'
import { cn } from '@pleadli/ui/lib/utils'
import { createFileRoute, Link } from '@tanstack/react-router'
import { format } from 'date-fns/format'
import { useMemo } from 'react'
import type { RemandListEntry } from '@/features/court-productions'

export const Route = createFileRoute('/_public/remand/')({
  loader: async ({ context }) => {
    await context.queryClient.query({ ...remandListOptions(), staleTime: 'static' })
  },
  component: RouteComponent,
})

/**
 * Court Production & Remand (docs/prisons/PRODUCT.md) — s.118's pre-session
 * "list of prisoners awaiting trial": admission date, authority for
 * detention, and date last appeared in court (derived from the latest
 * production record) — pulled out as first-class, same reasoning as DPP's
 * Intake.
 */
function RouteComponent() {
  const { data: remand } = useRemandList()

  const columns: DataTableColumnDef<RemandListEntry>[] = useMemo(() => {
    return [
      {
        id: 'name',
        accessorFn: (row) => prisonerFullName({ firstName: row.firstName, lastName: row.lastName, otherNames: null }),
        header: 'Name',
        cell: ({ row }) => (
          <Link
            to="/prisoners/$prisonerId"
            params={{ prisonerId: row.original.prisonerId }}
            className={cn('rounded-md bg-primary/15 px-3 py-1 text-xs', 'inline-block max-w-sm truncate')}
          >
            {prisonerFullName({ firstName: row.original.firstName, lastName: row.original.lastName, otherNames: null })}
          </Link>
        ),
      },
      { accessorKey: 'admissionAuthority', header: 'Authority for detention', cell: ({ row }) => row.original.admissionAuthority ?? '·' },
      { accessorKey: 'admittedAt', header: 'Admitted', cell: ({ getValue }) => format(getValue<number>(), 'PP') },
      {
        id: 'lastAppeared',
        header: 'Last appeared in court',
        cell: ({ row }) => (row.original.lastProducedAt ? format(row.original.lastProducedAt, 'PP') : 'Never produced'),
      },
      {
        id: 'daysInCustody',
        header: 'Days in custody',
        cell: ({ row }) => daysInCustody(row.original.admittedAt),
      },
      {
        id: 'threshold',
        header: 'Mandatory-bail threshold',
        cell: ({ row }) => {
          const threshold = mandatoryBailThresholdDays(row.original.highCourtOnlyOffence)
          const held = daysInCustody(row.original.admittedAt)
          return <Badge variant={held >= threshold ? 'destructive' : 'outline'}>{threshold} days</Badge>
        },
      },
    ]
  }, [])

  return (
    <article className="container flex flex-col gap-5 pt-5 pb-20">
      <section className="flex flex-col gap-1">
        <h1>Court Production &amp; Remand</h1>
        <p className="md:max-w-sm">Every prisoner currently on remand — the pre-session list Prisons Act s.118 requires.</p>
      </section>

      <DataTable
        aria-label="Remand list"
        data={remand}
        columns={columns}
        getRowId={(row) => row.prisonerId}
        emptyMessage="No one is currently on remand."
        searchPlaceholder="Search remand list…"
      />
    </article>
  )
}
