import { fileStatusLabel } from '@/features/prosecution-files'
import { intakeQueueOptions, useIntakeQueue } from '@/features/prosecution-files/queries'
import { Badge } from '@pleadli/ui/badge'
import { cn } from '@pleadli/ui/lib/utils'
import { createFileRoute, Link } from '@tanstack/react-router'
import { format } from 'date-fns/format'

export const Route = createFileRoute('/_public/')({
  loader: async ({ context }) => {
    await context.queryClient.query({ ...intakeQueueOptions(), staleTime: 'static' })
  },
  component: RouteComponent,
})

/**
 * "What needs my attention" (docs/dpp/PRODUCT.md §Work Queues) — every
 * bucket here is a real, confirmed review trigger, never an invented
 * metric. Only the intake backlog is wired so far; the Threshold Test
 * 14-day review, the 3-adjournment trigger, and upcoming trial-date
 * notices depend on Court Matters data this slice doesn't build yet.
 */
function RouteComponent() {
  const { data: intake } = useIntakeQueue()

  return (
    <article className="container flex flex-col gap-5 pt-5 pb-20">
      <section className="flex flex-col gap-1">
        <h1>Overview</h1>
        <p className="md:max-w-sm">What needs your attention.</p>
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <h2 className="text-base font-medium">Awaiting a charging decision</h2>
          <Badge variant="secondary">{intake.length}</Badge>
        </div>

        {intake.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing waiting on a charging decision.</p>
        ) : (
          <div className="flex flex-col divide-y divide-border/50 rounded-md border border-border/50">
            {intake.map((file) => (
              <Link
                key={file.id}
                to="/files"
                search={{ open: file.id }}
                className={cn('flex items-center justify-between gap-3 px-3 py-2 text-sm', 'hover:bg-muted/60')}
              >
                <div className="min-w-0">
                  <p className="truncate font-medium">{file.title}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {file.odppRegistrationNumber ?? 'No ODPP reg. no. yet'}
                    {file.policeStation ? ` · ${file.policeStation}` : ''}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Badge variant="outline">{fileStatusLabel(file.currentStatus)}</Badge>
                  <span className="text-xs text-muted-foreground">{format(file.receivedAt, 'PP')}</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </article>
  )
}
