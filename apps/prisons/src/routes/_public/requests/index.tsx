import { RequestsPage, requestsOptions } from '@/features/requests'
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/_public/requests/')({
  loader: async ({ context }) => {
    await context.queryClient.query({ ...requestsOptions(), staleTime: 'static' })
  },
  component: RouteComponent,
})

function RouteComponent() {
  return <RequestsPage />
}
