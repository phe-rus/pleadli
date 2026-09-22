import { incomingOptions, IncomingView, outgoingOptions } from '@/features/interchange'
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/_public/incoming/')({
  loader: async ({ context }) => {
    await Promise.all([context.queryClient.query({ ...incomingOptions(), staleTime: 'static' }), context.queryClient.query({ ...outgoingOptions(), staleTime: 'static' })])
  },
  component: IncomingView,
})
