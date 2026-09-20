import { remandListOptions } from '@/features/court-productions'
import { LegalPage, legalOverviewOptions } from '@/features/legal'
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/_public/legal/')({
  loader: async ({ context }) => {
    await Promise.all([
      context.queryClient.query({ ...legalOverviewOptions(), staleTime: 'static' }),
      context.queryClient.query({ ...remandListOptions(), staleTime: 'static' }),
    ])
  },
  component: RouteComponent,
})

function RouteComponent() {
  return <LegalPage />
}
