import { officersOptions, OfficersPage } from '@/features/officers'
import { dutyAssignmentsOptions } from '@/features/duty'
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/_public/station/officers')({
  validateSearch: (search: Record<string, unknown>): { open?: string } => (typeof search.open === 'string' ? { open: search.open } : {}),
  loader: async ({ context }) => {
    await Promise.all([
      context.queryClient.query({ ...officersOptions(), staleTime: 'static' }),
      // A Command is refused the roster, and its Officers page does not need it.
      context.queryClient.query({ ...dutyAssignmentsOptions(''), staleTime: 'static' }).catch(() => undefined),
    ])
  },
  component: OfficersPage,
})
