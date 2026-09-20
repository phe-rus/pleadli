import { InboxView } from '@/features/notifications'
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/_public/inbox/')({
  validateSearch: (search: Record<string, unknown>): { item?: string } => (typeof search.item === 'string' ? { item: search.item } : {}),
  component: RouteComponent,
})

function RouteComponent() {
  const { item } = Route.useSearch()
  const navigate = Route.useNavigate()
  return <InboxView selectedId={item} onSelect={(id) => navigate({ search: { item: id }, replace: true })} />
}
