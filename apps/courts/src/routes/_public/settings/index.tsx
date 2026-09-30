import { createFileRoute, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/_public/settings/')({
  beforeLoad: () => {
    throw redirect({ to: '/settings/$section', params: { section: 'bench' }, replace: true })
  },
})
