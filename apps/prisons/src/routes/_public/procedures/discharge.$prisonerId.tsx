import { DischargeProcedure, dischargeCheckOptions } from '@/features/releases'
import { prisonerOptions } from '@/features/prisoners'
import { propertyRecordsForPrisonerOptions } from '@/features/property-records'
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/_public/procedures/discharge/$prisonerId')({
  loader: async ({ context, params }) => {
    await Promise.all([
      context.queryClient.query({ ...prisonerOptions(params.prisonerId), staleTime: 'static' }),
      context.queryClient.query({ ...dischargeCheckOptions(params.prisonerId), staleTime: 'static' }),
      context.queryClient.query({ ...propertyRecordsForPrisonerOptions(params.prisonerId), staleTime: 'static' }),
    ])
  },
  component: RouteComponent,
})

function RouteComponent() {
  const { prisonerId } = Route.useParams()
  return <DischargeProcedure prisonerId={prisonerId} />
}
