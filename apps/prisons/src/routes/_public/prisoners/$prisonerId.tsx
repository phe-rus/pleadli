import { PrisonerFilePage, prisonerTabIds, prisonerOptions, type PrisonerTab } from '@/features/prisoners'
import { courtProductionsForPrisonerOptions } from '@/features/court-productions'
import { prisonerFileOptions } from '@/features/custody'
import { healthEventsForPrisonerOptions } from '@/features/health-events'
import { programmeParticipationsForPrisonerOptions } from '@/features/programme-participations'
import { propertyRecordsForPrisonerOptions } from '@/features/property-records'
import { releasesForPrisonerOptions } from '@/features/releases'
import { requestsForPrisonerOptions } from '@/features/requests'
import { transfersForPrisonerOptions } from '@/features/transfers'
import { visitsForPrisonerOptions } from '@/features/visits'
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/_public/prisoners/$prisonerId')({
  validateSearch: (search: Record<string, unknown>): { tab?: PrisonerTab } =>
    typeof search.tab === 'string' && (prisonerTabIds as readonly string[]).includes(search.tab) ? { tab: search.tab as PrisonerTab } : {},
  loader: async ({ context, params }) => {
    await Promise.all([
      context.queryClient.query({ ...prisonerOptions(params.prisonerId), staleTime: 'static' }),
      context.queryClient.query({ ...prisonerFileOptions(params.prisonerId), staleTime: 'static' }),
      context.queryClient.query({ ...courtProductionsForPrisonerOptions(params.prisonerId), staleTime: 'static' }),
      context.queryClient.query({ ...releasesForPrisonerOptions(params.prisonerId), staleTime: 'static' }),
      context.queryClient.query({ ...visitsForPrisonerOptions(params.prisonerId), staleTime: 'static' }),
      context.queryClient.query({ ...healthEventsForPrisonerOptions(params.prisonerId), staleTime: 'static' }),
      context.queryClient.query({ ...transfersForPrisonerOptions(params.prisonerId), staleTime: 'static' }),
      context.queryClient.query({ ...programmeParticipationsForPrisonerOptions(params.prisonerId), staleTime: 'static' }),
      context.queryClient.query({ ...propertyRecordsForPrisonerOptions(params.prisonerId), staleTime: 'static' }),
      context.queryClient.query({ ...requestsForPrisonerOptions(params.prisonerId), staleTime: 'static' }),
    ])
  },
  component: RouteComponent,
})


function RouteComponent() {
  const { prisonerId } = Route.useParams()
  const { tab } = Route.useSearch()
  const navigate = Route.useNavigate()
  return <PrisonerFilePage prisonerId={prisonerId} tab={tab} onTabChange={(next) => navigate({ search: { tab: next }, replace: true })} />
}
