import { PrisonersPage, prisonersOptions } from '@/features/prisoners'
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/_public/prisoners/')({
  validateSearch: (search: Record<string, unknown>): { open?: string; view?: string } => ({
    ...(typeof search.open === 'string' ? { open: search.open } : {}),
    ...(typeof search.view === 'string' ? { view: search.view } : {}),
  }),
  loader: async ({ context }) => {
    await context.queryClient.query({ ...prisonersOptions(''), staleTime: 'static' })
  },
  component: RouteComponent,
})

function RouteComponent() {
  const { open, view } = Route.useSearch()
  return <PrisonersPage openId={open} view={view} />
}
