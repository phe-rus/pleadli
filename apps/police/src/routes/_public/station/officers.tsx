import { officersOptions, OfficersPage } from '@/features/officers'
import { dutyAssignmentsOptions } from '@/features/duty'
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/_public/station/officers')({
  validateSearch: (search: Record<string, unknown>): { open?: string } => (typeof search.open === 'string' ? { open: search.open } : {}),
  loader: async ({ context }) => {
    await Promise.all([
      context.queryClient.query({ ...officersOptions(), staleTime: 'static' }),
      context.queryClient.query({ ...dutyAssignmentsOptions(''), staleTime: 'static' }),
    ])
  },
  component: OfficersPage,
})
