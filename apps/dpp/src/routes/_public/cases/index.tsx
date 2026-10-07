import { createFileRoute, redirect } from '@tanstack/react-router'

/** The board is now a way of showing All files; the old address still lands there. */
export const Route = createFileRoute('/_public/cases/')({
  beforeLoad: () => {
    throw redirect({ to: '/files', search: { view: 'all', layout: 'board' } })
  },
})
