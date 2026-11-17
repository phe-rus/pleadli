import { m } from '@/paraglide/messages'
import { PostboxView, type PostboxLabels } from '@pleadli/shell'
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/_public/postbox/')({ component: RouteComponent })

/** This app's own words for the shared postbox. */
const useLabels = (): PostboxLabels => ({
  title: m.postbox_title(),
  intro: m.postbox_intro(),
  inbox: { label: m.postbox_inbox(), empty: m.postbox_empty_inbox() },
  outbox: { label: m.postbox_outbox(), empty: m.postbox_empty_outbox() },
  status: m.postbox_status(),
})

function RouteComponent() {
  return <PostboxView labels={useLabels()} />
}
