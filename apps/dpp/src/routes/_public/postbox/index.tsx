import * as m from '@/paraglide/messages'
import { PostboxView, type PostboxLabels } from '@pleadli/shell'
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/_public/postbox/')({ component: RouteComponent })

/** This app's own words for the shared postbox. */
const useLabels = (): PostboxLabels => ({
  title: m['postbox.title'](),
  intro: m['postbox.intro'](),
  inbox: { label: m['postbox.inbox'](), empty: m['postbox.empty_inbox']() },
  outbox: { label: m['postbox.outbox'](), empty: m['postbox.empty_outbox']() },
  status: m['postbox.status'](),
})

function RouteComponent() {
  return <PostboxView labels={useLabels()} />
}
