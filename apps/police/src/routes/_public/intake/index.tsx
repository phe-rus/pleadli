import { createFileRoute, redirect } from '@tanstack/react-router'

/** Case intake was a second list of the same cases. Cases now live in one
 * place, by folder; an old link to a case opens that case. */
export const Route = createFileRoute('/_public/intake/')({
  validateSearch: (search: Record<string, unknown>): { open?: string } => (typeof search.open === 'string' ? { open: search.open } : {}),
  beforeLoad: ({ search }) => {
    if (search.open) throw redirect({ to: '/investigations/$caseId', params: { caseId: search.open } })
    throw redirect({ to: '/investigations', search: { view: 'all' } })
  },
})
