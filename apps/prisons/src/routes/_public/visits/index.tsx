import { VisitsPage, allVisitsOptions, visitRulesOptions } from '@/features/visits'
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/_public/visits/')({
  loader: async ({ context }) => {
    await Promise.all([
      context.queryClient.query({ ...allVisitsOptions(), staleTime: 'static' }),
      context.queryClient.query({ ...visitRulesOptions(), staleTime: 'static' }),
    ])
  },
  component: RouteComponent,
})

function RouteComponent() {
  return <VisitsPage />
}
