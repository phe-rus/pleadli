import { Createpanel } from '@/components/create-panel'
import {
  dutyAssignmentsOptions,
  DutyAssignmentForm,
  useDutyAssignments,
  type DutyAssignment,
} from '@/features/duty'
import { AddCircleIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { DataTable, selectColumn, type DataTableColumnDef } from '@pleadli/forms-tables'
import { Button } from '@pleadli/ui/button'
import { cn } from '@pleadli/ui/lib/utils'
import { useDeepLinkRecord } from '@/hooks/use-deep-link-record'
import { createFileRoute } from '@tanstack/react-router'
import { format } from 'date-fns/format'
import { useMemo, useState } from 'react'

export const Route = createFileRoute('/_public/roster/')({
  validateSearch: (search: Record<string, unknown>): { open?: string } =>
    typeof search.open === 'string' ? { open: search.open } : {},
  loader: async ({ context }) => {
    await context.queryClient.query({ ...dutyAssignmentsOptions(''), staleTime: 'static' })
  },
  component: RouteComponent,
})

function RouteComponent() {
  const { open: openId } = Route.useSearch()
  const [addOpen, setAddOpen] = useState(false)
  const [editing, setEditing] = useState<DutyAssignment | null>(null)
  const { data: assignments } = useDutyAssignments('')
  useDeepLinkRecord(assignments, openId, setEditing)

  const columns: DataTableColumnDef<DutyAssignment>[] = useMemo(() => {
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
      { accessorKey: 'officerName', header: 'Officer' },
      {
        accessorKey: 'officerRank',
        header: 'Rank',
        cell: ({ row }) => row.original.officerRank ?? '·',
      },
      {
        accessorKey: 'unit',
        header: 'Unit',
        cell: ({ row }) => row.original.unit ?? '·',
      },
      {
        accessorKey: 'shiftStart',
        header: 'Shift start',
        cell: ({ getValue }) => format(getValue<number>(), 'PPp'),
      },
      {
        accessorKey: 'shiftEnd',
        header: 'Shift end',
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
            <h1>Duty Roster</h1>

            <Createpanel
              open={addOpen}
              onOpenChange={setAddOpen}
              trigger={
                <Button size="sm">
                  <HugeiconsIcon icon={AddCircleIcon} />
                  Add assignment
                </Button>
              }
              headings={{ title: 'Add duty assignment', description: 'Who is on duty, and when.' }}
            >
              <DutyAssignmentForm onSuccess={() => setAddOpen(false)} />
            </Createpanel>
          </div>
          <p className="md:max-w-sm">Officer assignments and shift coverage at this station.</p>
        </div>
      </section>

      <Createpanel
        open={editing !== null}
        onOpenChange={(open) => {
          if (!open) setEditing(null)
        }}
        headings={{ title: 'Edit assignment', description: 'Update this duty assignment.' }}
      >
        {editing && (
          <DutyAssignmentForm key={editing.id} assignment={editing} onSuccess={() => setEditing(null)} />
        )}
      </Createpanel>

      <DataTable
        aria-label="Duty Roster"
        data={assignments}
        columns={columns}
        getRowId={(row) => row.id}
        emptyMessage="No duty assignments yet."
        searchPlaceholder="Search the roster…"
      />
    </article>
  )
}
