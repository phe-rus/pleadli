import { dutyAssignmentsOptions, RosterPage } from '@/features/duty'
import { checkInsOptions, shiftHandoversOptions } from '@/features/shift-log'
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/_public/roster/')({
  validateSearch: (search: Record<string, unknown>): { open?: string; view?: 'now' | 'week' | 'book' } => ({
    ...(typeof search.open === 'string' ? { open: search.open } : {}),
    ...(search.view === 'week' || search.view === 'book' ? { view: search.view } : {}),
  }),
  loader: async ({ context }) => {
    await Promise.all([
      context.queryClient.query({ ...dutyAssignmentsOptions(''), staleTime: 'static' }),
      context.queryClient.query({ ...checkInsOptions(''), staleTime: 'static' }),
      context.queryClient.query({ ...shiftHandoversOptions(''), staleTime: 'static' }),
    ])
  },
  component: RosterPage,
})
