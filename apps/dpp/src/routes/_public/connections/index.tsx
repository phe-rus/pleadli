import { connectionsOptions, ConnectionsView, identityOptions } from '@/features/interchange'
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/_public/connections/')({
  loader: async ({ context }) => {
    await Promise.all([context.queryClient.query({ ...identityOptions(), staleTime: 'static' }), context.queryClient.query({ ...connectionsOptions(), staleTime: 'static' })])
  },
  component: ConnectionsView,
})
