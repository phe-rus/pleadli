import { incomingDetailOptions, IncomingReview } from '@/features/interchange'
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/_public/incoming/$packageId')({
  loader: async ({ context, params }) => {
    await context.queryClient.query({ ...incomingDetailOptions(params.packageId), staleTime: 'static' })
  },
  component: RouteComponent,
})

function RouteComponent() {
  const { packageId } = Route.useParams()
  return <IncomingReview id={packageId} />
}
