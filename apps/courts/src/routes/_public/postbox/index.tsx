import { PostboxView, type PostboxLabels } from '@pleadli/shell'
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/_public/postbox/')({ component: RouteComponent })

// Courts words, English until feature 15 moves them into messages.
const labels: PostboxLabels = {
  title: 'Postbox',
  intro: 'Papers sent to and from other offices will arrive here, so nothing has to be carried on a stick.',
  inbox: { label: 'Inbox', empty: 'Nothing has arrived yet.' },
  outbox: { label: 'Outbox', empty: 'Nothing is waiting to be sent.' },
  status: 'Not switched on yet. It will work once your office is connected to Pleadli.',
}

function RouteComponent() {
  return <PostboxView labels={labels} />
}
