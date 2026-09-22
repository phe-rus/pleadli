import { EmptyNote } from '@/components/planned'
import { Tag } from '@/components/status-tag'
import { diaryOptions, HearingActions, purposeLabel, useDiary, type DiaryRow } from '@/features/hearings'
import { dayBounds, fromIsoDay, startOfDay, toIsoDay } from '@/lib/day'
import { ArrowLeft01Icon, ArrowRight01Icon, PrinterIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Button } from '@pleadli/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@pleadli/ui/table'
import { createFileRoute, Link } from '@tanstack/react-router'
import { addDays } from 'date-fns/addDays'
import { format } from 'date-fns/format'

export const Route = createFileRoute('/_public/diary/')({
  validateSearch: (search: Record<string, unknown>): { day?: string } => (fromIsoDay(search.day) != null ? { day: search.day as string } : {}),
  loaderDeps: ({ search }) => ({ day: search.day ?? toIsoDay(Date.now()) }),
  loader: async ({ context, deps }) => {
    const { from, to } = dayBounds(fromIsoDay(deps.day) ?? Date.now())
    await context.queryClient.query({ ...diaryOptions(from, to), staleTime: 'static' })
  },
  component: RouteComponent,
})

function statusTag(row: DiaryRow) {
  if (row.status === 'attended') return <Tag tone="done">Attended</Tag>
  if (row.status === 'adjourned') return <Tag tone="waiting">Adjourned</Tag>
  if (row.status === 'missed') return <Tag tone="urgent">Missed</Tag>
  if (row.at < startOfDay(Date.now())) return <Tag tone="urgent">Not closed</Tag>
  return <Tag tone="open">To attend</Tag>
}

/** The day's hearings, in the order they fall. It prints as a plain table, with
 * the actions left off. */
function RouteComponent() {
  const { day } = Route.useSearch()
  const at = fromIsoDay(day) ?? startOfDay(Date.now())
  const { from, to } = dayBounds(at)
  const { data: rows } = useDiary(from, to)
  const isToday = toIsoDay(at) === toIsoDay(Date.now())

  return (
    <article className="page">
      <header className="page-header print:hidden">
        <div>
          <h1>Diary</h1>
          <p>Your hearings for {format(at, 'EEEE d MMMM yyyy')}.</p>
        </div>
        <div className="page-actions">
          <Button size="icon-sm" variant="ghost" aria-label="Previous day" title="Previous day" nativeButton={false} render={<Link to="/diary" search={{ day: toIsoDay(addDays(at, -1)) }} />}>
            <HugeiconsIcon icon={ArrowLeft01Icon} />
          </Button>
          <Button size="sm" variant={isToday ? 'secondary' : 'outline'} nativeButton={false} render={<Link to="/diary" search={{}} />}>
            Today
          </Button>
          <Button size="icon-sm" variant="ghost" aria-label="Next day" title="Next day" nativeButton={false} render={<Link to="/diary" search={{ day: toIsoDay(addDays(at, 1)) }} />}>
            <HugeiconsIcon icon={ArrowRight01Icon} />
          </Button>
          <Button size="sm" variant="secondary" onClick={() => window.print()} disabled={rows.length === 0}>
            <HugeiconsIcon icon={PrinterIcon} />
            Print
          </Button>
        </div>
      </header>

      <div className="hidden print:block">
        <h1>Diary</h1>
        <p>{format(at, 'EEEE d MMMM yyyy')}</p>
      </div>

      {rows.length === 0 ? (
        <EmptyNote>Nothing is in the diary for {isToday ? 'today' : format(at, 'd MMMM yyyy')}. List a hearing from a matter.</EmptyNote>
      ) : (
        <Table aria-label={`Diary for ${format(at, 'd MMMM yyyy')}`}>
          <TableHeader>
            <TableRow>
              <TableHead>Time</TableHead>
              <TableHead>Matter</TableHead>
              <TableHead>Client</TableHead>
              <TableHead>For</TableHead>
              <TableHead>Court</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="print:hidden">
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.id}>
                <TableCell>{format(row.at, 'HH:mm')}</TableCell>
                <TableCell>
                  <Link to="/matters/$matterId" params={{ matterId: row.matterId }} className="text-foreground">
                    {row.courtNumber ?? row.matterTitle}
                  </Link>
                  <p>{row.matterTitle}</p>
                </TableCell>
                <TableCell>
                  {row.clientName}
                  {row.clientCustody === 'remanded' && <p className="text-muted-foreground">On remand</p>}
                </TableCell>
                <TableCell>{purposeLabel(row.purpose)}</TableCell>
                <TableCell>{[row.courtName, row.courtroom].filter(Boolean).join(', ') || '·'}</TableCell>
                <TableCell>{statusTag(row)}</TableCell>
                <TableCell className="print:hidden">
                  <div className="flex items-center justify-end gap-1">{row.status === 'scheduled' && <HearingActions hearing={row} matterId={row.matterId} />}</div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </article>
  )
}
