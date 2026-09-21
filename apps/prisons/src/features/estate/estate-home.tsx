import { usePendingFacilityAlerts } from '@/hooks/use-pending-facility-alerts'
import { usePermissions } from '@/features/session'
import { ArrowRight01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { buttonVariants } from '@pleadli/ui/button'
import { Link } from '@tanstack/react-router'
import { format } from 'date-fns/format'
import { m } from '@/paraglide/messages'
import { EstateAttention } from './estate-attention'
import { FacilitiesByRegion } from './facilities-by-region'
import { HqObligations } from './hq-obligations'
import { NetworkEvents } from './network-events'
import { NetworkHealth } from './network-health'
import { useEstate } from './queries'

/**
 * The Head Office home (docs/prisons/product/08 2.2), read top to bottom as
 * the questions Head Office arrives with: how healthy is the network, which
 * facilities need looking at, how is each region, what has lately arrived,
 * and what is waiting on Head Office. Head Office holds no prisoners, so
 * there is no population statistics here; those figures are on Reports.
 */
export function EstateHome() {
  const { can } = usePermissions()
  usePendingFacilityAlerts()
  const allowed = can('hq.estate.read')
  const { data: estate, isPending, isError } = useEstate(allowed)

  return (
    <article className="page">
      <header className="page-header">
        <div>
          <p>
            {m.estate_title()} · {format(estate?.asOf ?? Date.now(), 'EEEE d MMMM yyyy')}
          </p>
          <h1>{m.estate_title()}</h1>
          <p>{m.estate_page_about()}</p>
        </div>
        <div className="page-actions">
          <Link to="/facilities" className={buttonVariants({ size: 'sm', variant: 'secondary' })}>
            {m.route_index_view_facilities()}
            <HugeiconsIcon icon={ArrowRight01Icon} />
          </Link>
        </div>
      </header>

      {!allowed ? (
        <p>{m.estate_no_access()}</p>
      ) : isError ? (
        <p>{m.estate_could_not_load()}</p>
      ) : isPending || !estate ? null : (
        <>
          <NetworkHealth estate={estate} />
          <EstateAttention estate={estate} />
          <FacilitiesByRegion estate={estate} />
          <div className="grid gap-x-8 gap-y-6 lg:grid-cols-2">
            <NetworkEvents estate={estate} />
            <HqObligations estate={estate} />
          </div>
        </>
      )}
    </article>
  )
}
