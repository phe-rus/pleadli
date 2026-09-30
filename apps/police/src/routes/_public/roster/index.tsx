import * as m from '@/paraglide/messages'
import { Createpanel } from '@/components/create-panel'
import {
  dutyAssignmentsOptions,
  DutyAssignmentForm,
  useDutyAssignments,
  type DutyAssignment,
} from '@/features/duty'
import {
  checkInMethodLabel,
  checkInsOptions,
  shiftHandoversOptions,
  CheckInDialog,
  HandoverForm,
  useCheckIns,
  useShiftHandovers,
} from '@/features/shift-log'
import { AddCircleIcon, LoginCircle01Icon, UserSwitchIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { DataTable, selectColumn, type DataTableColumnDef } from '@pleadli/forms-tables'
import { Button } from '@pleadli/ui/button'
import { cn } from '@pleadli/ui/lib/utils'
import { useDeepLinkRecord } from '@/hooks/use-deep-link-record'
import { createFileRoute } from '@tanstack/react-router'
import { format } from '@/lib/date'
import { useMemo, useState } from 'react'
import type { OfficerCheckIn, ShiftHandover } from '@/features/shift-log'

export const Route = createFileRoute('/_public/roster/')({
  validateSearch: (search: Record<string, unknown>): { open?: string } =>
    typeof search.open === 'string' ? { open: search.open } : {},
  loader: async ({ context }) => {
    await Promise.all([
      context.queryClient.query({ ...dutyAssignmentsOptions(''), staleTime: 'static' }),
      context.queryClient.query({ ...checkInsOptions(''), staleTime: 'static' }),
      context.queryClient.query({ ...shiftHandoversOptions(''), staleTime: 'static' }),
    ])
  },
  component: RouteComponent,
})

function RouteComponent() {
  const { open: openId } = Route.useSearch()
  const [addOpen, setAddOpen] = useState(false)
  const [checkInOpen, setCheckInOpen] = useState(false)
  const [handoverOpen, setHandoverOpen] = useState(false)
  const [editing, setEditing] = useState<DutyAssignment | null>(null)
  const { data: assignments } = useDutyAssignments('')
  const { data: checkIns } = useCheckIns('')
  const { data: handovers } = useShiftHandovers('')
  useDeepLinkRecord(assignments, openId, setEditing)

  const checkInColumns: DataTableColumnDef<OfficerCheckIn>[] = useMemo(() => {
    return [
      selectColumn(),
      { accessorKey: 'officerName', header: m["col.officer"]() },
      { accessorKey: 'method', header: m["col.method"](), cell: ({ getValue }) => checkInMethodLabel(getValue<string>()) },
      {
        accessorKey: 'checkedInAt',
        header: m["col.checked_in"](),
        cell: ({ getValue }) => format(getValue<number>(), 'PPp'),
      },
    ]
  }, [])

  const handoverColumns: DataTableColumnDef<ShiftHandover>[] = useMemo(() => {
    return [
      selectColumn(),
      {
        accessorKey: 'outgoingOfficerName',
        header: m["col.outgoing"](),
        cell: ({ row }) => row.original.outgoingOfficerName ?? '·',
      },
      { accessorKey: 'incomingOfficerName', header: m["col.incoming"]() },
      { accessorKey: 'unit', header: m["col.unit"](), cell: ({ row }) => row.original.unit ?? '·' },
      { accessorKey: 'notes', header: m["col.notes"](), cell: ({ row }) => row.original.notes ?? '·' },
      {
        accessorKey: 'handedOverAt',
        header: m["col.handed_over"](),
        cell: ({ getValue }) => format(getValue<number>(), 'PPp'),
      },
    ]
  }, [])

  const columns: DataTableColumnDef<DutyAssignment>[] = useMemo(() => {
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
      { accessorKey: 'officerName', header: m["col.officer"]() },
      {
        accessorKey: 'officerRank',
        header: m["col.rank"](),
        cell: ({ row }) => row.original.officerRank ?? '·',
      },
      {
        accessorKey: 'unit',
        header: m["col.unit"](),
        cell: ({ row }) => row.original.unit ?? '·',
      },
      {
        accessorKey: 'shiftStart',
        header: m["col.shift_start"](),
        cell: ({ getValue }) => format(getValue<number>(), 'PPp'),
      },
      {
        accessorKey: 'shiftEnd',
        header: m["col.shift_end"](),
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
          <div className="flex items-center gap-2">
            <h1>{m["roster.title"]()}</h1>

            <Createpanel
              open={addOpen}
              onOpenChange={setAddOpen}
              trigger={
                <Button size="sm">
                  <HugeiconsIcon icon={AddCircleIcon} />
                  {m["duty.submit"]()}
                </Button>
              }
              headings={{ title: m["roster.add_title"](), description: m["roster.add_desc"]() }}
            >
              <DutyAssignmentForm onSuccess={() => setAddOpen(false)} />
            </Createpanel>

            <Button size="sm" variant="secondary" onClick={() => setCheckInOpen(true)}>
              <HugeiconsIcon icon={LoginCircle01Icon} />
              {m["shift_log.check_in"]()}
            </Button>
            <CheckInDialog open={checkInOpen} onOpenChange={setCheckInOpen} />

            <Createpanel
              open={handoverOpen}
              onOpenChange={setHandoverOpen}
              trigger={
                <Button size="sm" variant="secondary">
                  <HugeiconsIcon icon={UserSwitchIcon} />
                  {m["shift_log.submit"]()}
                </Button>
              }
              headings={{ title: m["roster.handover_title"](), description: m["roster.handover_desc"]() }}
            >
              <HandoverForm onSuccess={() => setHandoverOpen(false)} />
            </Createpanel>
          </div>
          <p className="md:max-w-sm">{m["roster.lead"]()}</p>
        </div>
      </section>

      <Createpanel
        open={editing !== null}
        onOpenChange={(open) => {
          if (!open) setEditing(null)
        }}
        headings={{ title: m["roster.edit_title"](), description: m["roster.edit_desc"]() }}
      >
        {editing && (
          <DutyAssignmentForm key={editing.id} assignment={editing} onSuccess={() => setEditing(null)} />
        )}
      </Createpanel>

      <DataTable
        aria-label={m["roster.title"]()}
        data={assignments}
        columns={columns}
        getRowId={(row) => row.id}
        emptyMessage={m["roster.empty"]()}
        searchPlaceholder={m["roster.search"]()}
      />

      <section className="flex flex-col gap-3">
        <h2>{m["roster.check_ins"]()}</h2>
        <DataTable
          aria-label={m["roster.check_ins"]()}
          data={checkIns}
          columns={checkInColumns}
          getRowId={(row) => row.id}
          emptyMessage={m["roster.check_ins_empty"]()}
          searchPlaceholder={m["roster.check_ins_search"]()}
        />
      </section>

      <section className="flex flex-col gap-3">
        <h2>{m["roster.handovers"]()}</h2>
        <DataTable
          aria-label={m["roster.handovers"]()}
          data={handovers}
          columns={handoverColumns}
          getRowId={(row) => row.id}
          emptyMessage={m["roster.handovers_empty"]()}
          searchPlaceholder={m["roster.handovers_search"]()}
        />
      </section>
    </article>
  )
}
