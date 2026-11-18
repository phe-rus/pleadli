import * as m from '@/paraglide/messages'
import { listIncoming, listOutgoing, outgoingKindLabels, type Outgoing } from '@/features/interchange'
import { PostboxView, type PostboxLabels, type PostboxMessage } from '@pleadli/shell'
import { buttonVariants } from '@pleadli/ui/button'
import { createFileRoute, Link } from '@tanstack/react-router'
import { useEffect, useMemo, useState } from 'react'

export const Route = createFileRoute('/_public/postbox/')({ component: RouteComponent })

/** This app's own words for the shared postbox. */
const useLabels = (): PostboxLabels => ({
  title: m['postbox.title'](),
  intro: m['postbox.intro'](),
  inbox: { label: m['postbox.inbox'](), empty: m['postbox.empty_inbox']() },
  outbox: { label: m['postbox.outbox'](), empty: m['postbox.empty_outbox']() },
  sent: { label: m['postbox.sent'](), empty: m['postbox.empty_sent']() },
  status: m['postbox.status'](),
  search: m['postbox.search'](),
  select: m['postbox.select'](),
  from: m['postbox.from'](),
  to: m['postbox.to'](),
})

type Row = Awaited<ReturnType<typeof listIncoming>>[number]

function RouteComponent() {
  const labels = useLabels()
  const [incoming, setIncoming] = useState<Row[]>([])
  const [outgoing, setOutgoing] = useState<Outgoing[]>([])
  useEffect(() => {
    // Before the office has an exchange identity these answer with nothing.
    listIncoming().then(setIncoming).catch(() => {})
    listOutgoing().then(setOutgoing).catch(() => {})
  }, [])

  const messages = useMemo<PostboxMessage[]>(
    () => [
      ...incoming.map((i) => ({
        id: i.id,
        box: 'inbox' as const,
        unread: i.status === 'received',
        party: i.stationName ?? '',
        at: i.receivedAt,
        subject: m['postbox.referral_subject']({ reference: i.policeReference ?? '' }),
        preview: i.status === 'received' ? m['postbox.waiting_to_read']() : i.rejectReason ?? m['postbox.dealt_with'](),
        body: (
          <div className="flex flex-col gap-3">
            <p>{m['postbox.referral_body']({ station: i.stationName ?? '' })}</p>
            <Link to="/incoming" className={buttonVariants({ variant: 'secondary', size: 'sm' }) + ' w-fit'}>
              {m['postbox.open_incoming']()}
            </Link>
          </div>
        ),
        state: i.resubmission ? m['postbox.resubmission']() : undefined,
      })),
      ...outgoing.map((o) => ({
        id: o.id,
        box: (o.exportedAt ? 'sent' : 'outbox') as 'sent' | 'outbox',
        party: o.stationName ?? '',
        at: o.exportedAt ?? o.preparedAt,
        subject: `${outgoingKindLabels[o.kind] ?? o.kind}${o.policeReference ? `: ${o.policeReference}` : ''}`,
        preview: o.summary,
        body: <p className="whitespace-pre-wrap">{o.summary}</p>,
      })),
    ],
    [incoming, outgoing],
  )

  return <PostboxView labels={labels} messages={messages} />
}
