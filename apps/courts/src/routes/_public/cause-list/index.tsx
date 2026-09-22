import { EmptyNote } from '@/components/planned'
import { Tag } from '@/components/status-tag'
import { causeListOptions, purposeLabel, SittingActions, useCauseList, type CauseListRow } from '@/features/sittings'
import { dayBounds, fromIsoDay, startOfDay, toIsoDay } from '@/lib/day'
import { ArrowLeft01Icon, ArrowRight01Icon, PrinterIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Button } from '@pleadli/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@pleadli/ui/table'
import { createFileRoute, Link } from '@tanstack/react-router'
import { addDays } from 'date-fns/addDays'
import { format } from 'date-fns/format'

export const Route = createFileRoute('/_public/cause-list/')({
  validateSearch: (search: Record<string, unknown>): { day?: string } => (fromIsoDay(search.day) != null ? { day: search.day as string } : {}),
  loaderDeps: ({ search }) => ({ day: search.day ?? toIsoDay(Date.now()) }),
  loader: async ({ context, deps }) => {
    const { from, to } = dayBounds(fromIsoDay(deps.day) ?? Date.now())
    await context.queryClient.query({ ...causeListOptions(from, to), staleTime: 'static' })
  },
  component: RouteComponent,
})

function statusTag(row: CauseListRow) {
  if (row.status === 'held') return <Tag tone="done">Held</Tag>
  if (row.status === 'adjourned') return <Tag tone="waiting">Adjourned</Tag>
  if (row.scheduledAt < startOfDay(Date.now())) return <Tag tone="urgent">Not closed</Tag>
  return <Tag tone="open">To be heard</Tag>
}

/** The day's list of matters, in the order they are called. It is also the page
 * that is printed and put on the door or handed to the clerk, so on paper it is
 * a plain table with the actions left off. */
function RouteComponent() {
  const { day } = Route.useSearch()
  const at = fromIsoDay(day) ?? startOfDay(Date.now())
  const { from, to } = dayBounds(at)
  const { data: rows } = useCauseList(from, to)
  const isToday = toIsoDay(at) === toIsoDay(Date.now())

  return (
    <article className="page">
      <header className="page-header print:hidden">
        <div>
          <h1>Cause list</h1>
          <p>The matters listed for {format(at, 'EEEE d MMMM yyyy')}, in the order they are called.</p>
        </div>
        <div className="page-actions">
          <Button size="icon-sm" variant="ghost" aria-label="Previous day" title="Previous day" nativeButton={false} render={<Link to="/cause-list" search={{ day: toIsoDay(addDays(at, -1)) }} />}>
            <HugeiconsIcon icon={ArrowLeft01Icon} />
          </Button>
          <Button size="sm" variant={isToday ? 'secondary' : 'outline'} nativeButton={false} render={<Link to="/cause-list" search={{}} />}>
            Today
          </Button>
          <Button size="icon-sm" variant="ghost" aria-label="Next day" title="Next day" nativeButton={false} render={<Link to="/cause-list" search={{ day: toIsoDay(addDays(at, 1)) }} />}>
            <HugeiconsIcon icon={ArrowRight01Icon} />
          </Button>
          <Button size="sm" variant="secondary" onClick={() => window.print()} disabled={rows.length === 0}>
            <HugeiconsIcon icon={PrinterIcon} />
            Print
          </Button>
        </div>
      </header>

      <div className="hidden print:block">
        <h1>Cause list</h1>
        <p>{format(at, 'EEEE d MMMM yyyy')}</p>
      </div>

      {rows.length === 0 ? (
        <EmptyNote>Nothing is listed for {isToday ? 'today' : format(at, 'd MMMM yyyy')}. Schedule a sitting from a case.</EmptyNote>
      ) : (
        <Table aria-label={`Cause list for ${format(at, 'd MMMM yyyy')}`}>
          <TableHeader>
            <TableRow>
              <TableHead>No.</TableHead>
              <TableHead>Time</TableHead>
              <TableHead>Case</TableHead>
              <TableHead>Accused</TableHead>
              <TableHead>For</TableHead>
              <TableHead>Court</TableHead>
              <TableHead>Custody</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="print:hidden">
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row, index) => (
              <TableRow key={row.id}>
                <TableCell>{index + 1}</TableCell>
                <TableCell>{format(row.scheduledAt, 'HH:mm')}</TableCell>
                <TableCell>
                  <Link to="/cases/$caseId" params={{ caseId: row.caseId }} className="text-foreground">
                    {row.courtNumber}
                  </Link>
                  <p>{row.caseTitle}</p>
                </TableCell>
                <TableCell>{row.accused ?? '·'}</TableCell>
                <TableCell>
                  {purposeLabel(row.purpose)}
                  {row.adjournments > 0 && <p className="text-muted-foreground">Adjourned {row.adjournments === 1 ? 'once' : `${row.adjournments} times`} before</p>}
                </TableCell>
                <TableCell>{row.courtroom ?? '·'}</TableCell>
                <TableCell>{row.hasRemand ? 'To be produced' : '·'}</TableCell>
                <TableCell>{statusTag(row)}</TableCell>
                <TableCell className="print:hidden">
                  <div className="flex items-center justify-end gap-1">
                    <Link to="/sittings/$sittingId" params={{ sittingId: row.id }} className="px-2 text-primary">
                      Open
                    </Link>
                    {row.status === 'scheduled' && <SittingActions sitting={row} caseId={row.caseId} />}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </article>
  )
}
