import { estateOptions } from '@/features/estate'
import { todayOptions } from '@/features/obligations'
import { HomePage } from '@/features/today'
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/_public/')({
  loader: async ({ context }) => {
    await Promise.all([
      context.queryClient.query({ ...todayOptions(), staleTime: 'static' }).catch(() => undefined),
      context.queryClient.query({ ...estateOptions(), staleTime: 'static' }).catch(() => undefined),
    ])
  },
  component: RouteComponent,
})

function RouteComponent() {
  return <HomePage />
}
