import { TransferOutPage } from '@/features/procedures'
import { prisonerOptions } from '@/features/prisoners'
import { transfersForPrisonerOptions } from '@/features/transfers'
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/_public/procedures/transfer/$prisonerId')({
  loader: async ({ context, params }) => {
    await Promise.all([
      context.queryClient.query({ ...prisonerOptions(params.prisonerId), staleTime: 'static' }),
      context.queryClient.query({ ...transfersForPrisonerOptions(params.prisonerId), staleTime: 'static' }),
    ])
  },
  component: RouteComponent,
})

function RouteComponent() {
  const { prisonerId } = Route.useParams()
  return <TransferOutPage prisonerId={prisonerId} />
}
