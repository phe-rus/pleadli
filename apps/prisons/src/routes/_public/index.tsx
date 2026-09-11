import { mandatoryBailThresholdDays, daysInCustody, prisonerFullName } from '@/features/prisoners'
import { inCustodyOptions, useInCustody } from '@/features/prisoners/queries'
import { remandListOptions, useRemandList } from '@/features/court-productions'
import { Badge } from '@pleadli/ui/badge'
import { cn } from '@pleadli/ui/lib/utils'
import { createFileRoute, Link } from '@tanstack/react-router'
import { format } from 'date-fns/format'

export const Route = createFileRoute('/_public/')({
  loader: async ({ context }) => {
    await Promise.all([
      context.queryClient.query({ ...inCustodyOptions(), staleTime: 'static' }),
      context.queryClient.query({ ...remandListOptions(), staleTime: 'static' }),
    ])
  },
  component: RouteComponent,
})

/**
 * "What needs my attention" (docs/prisons/PRODUCT.md §Work Queues) — every
 * bucket here traces to a confirmed statutory trigger. The mandatory-bail
 * flag uses the Constitution's 60/180-day thresholds (Art. 23(6)), not the
 * Prisons Act's own unreformed 120/360-day text — see the Custody & Remand
 * tracking section of the product model for the citation.
 */
function RouteComponent() {
  const { data: inCustody } = useInCustody()
  const { data: remand } = useRemandList()

  const overThreshold = remand.filter((entry) => daysInCustody(entry.admittedAt) >= mandatoryBailThresholdDays(entry.highCourtOnlyOffence))

  return (
    <article className="container flex flex-col gap-5 pt-5 pb-20">
      <section className="flex flex-col gap-1">
        <h1>Overview</h1>
        <p className="md:max-w-sm">What needs your attention.</p>
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <h2 className="text-base font-medium">Currently in custody</h2>
          <Badge variant="secondary">{inCustody.length}</Badge>
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <h2 className="text-base font-medium">Past mandatory-bail threshold</h2>
          <Badge variant={overThreshold.length > 0 ? 'destructive' : 'secondary'}>{overThreshold.length}</Badge>
        </div>

        {overThreshold.length === 0 ? (
          <p className="text-sm text-muted-foreground">No one on remand is past their constitutional mandatory-bail threshold.</p>
        ) : (
          <div className="flex flex-col divide-y divide-border/50 rounded-md border border-border/50">
            {overThreshold.map((entry) => (
              <Link
                key={entry.prisonerId}
                to="/prisoners"
                search={{ open: entry.prisonerId }}
                className={cn('flex items-center justify-between gap-3 px-3 py-2 text-sm', 'hover:bg-muted/60')}
              >
                <div className="min-w-0">
                  <p className="truncate font-medium">
                    {prisonerFullName({ firstName: entry.firstName, lastName: entry.lastName, otherNames: null })}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    Admitted {format(entry.admittedAt, 'PP')} · {daysInCustody(entry.admittedAt)} days in custody
                    {entry.admissionAuthority ? ` · ${entry.admissionAuthority}` : ''}
                  </p>
                </div>
                <Badge variant="outline">{mandatoryBailThresholdDays(entry.highCourtOnlyOffence)}-day threshold</Badge>
              </Link>
            ))}
          </div>
        )}
      </section>
    </article>
  )
}
