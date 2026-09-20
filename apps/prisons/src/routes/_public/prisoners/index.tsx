import { PrisonersPage, prisonersOptions } from '@/features/prisoners'
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/_public/prisoners/')({
  validateSearch: (search: Record<string, unknown>): { open?: string } =>
    typeof search.open === 'string' ? { open: search.open } : {},
  loader: async ({ context }) => {
    await context.queryClient.query({ ...prisonersOptions(''), staleTime: 'static' })
  },
  component: RouteComponent,
})

function RouteComponent() {
  const { open } = Route.useSearch()
  return <PrisonersPage openId={open} />
}
