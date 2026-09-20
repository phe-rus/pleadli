import { ReportsPage, reportsOptions } from '@/features/reports'
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/_public/reports/')({
  loader: async ({ context }) => {
    await context.queryClient.query({ ...reportsOptions(), staleTime: 'static' }).catch(() => undefined)
  },
  component: RouteComponent,
})

function RouteComponent() {
  return <ReportsPage />
}
