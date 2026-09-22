import { pendingRequestsOptions, StationsPage, stationsOptions } from '@/features/command'
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/_public/stations/')({
  loader: async ({ context }) => {
    await Promise.all([context.queryClient.query({ ...stationsOptions(), staleTime: 'static' }), context.queryClient.query({ ...pendingRequestsOptions(), staleTime: 'static' })])
  },
  component: StationsPage,
})
