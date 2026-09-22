import { createFileRoute, redirect } from '@tanstack/react-router'

/** Intake used to be a page of its own. It is now one view of Files; this keeps
 * old links and notifications working. */
export const Route = createFileRoute('/_public/intake/')({
  beforeLoad: () => {
    throw redirect({ to: '/files', search: { view: 'intake' }, replace: true })
  },
})
