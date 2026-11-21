import * as m from '@/paraglide/messages'
import { listIncoming, listOutgoing, outgoingKindLabels, type Outgoing } from '@/features/interchange'
import { PostboxView, ReceivingAddress, type PostboxLabels, type PostboxMessage } from '@pleadli/shell'
import { answerCourtInvitation, checkRelay, declineCourtInvitation, getRelay, type RelayStatus } from '@/features/relay/data'
import { Button, buttonVariants } from '@pleadli/ui/button'
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
  const [relay, setRelay] = useState<RelayStatus | null>(null)
  useEffect(() => {
    // Before the office has an exchange identity these answer with nothing.
    listIncoming().then(setIncoming).catch(() => {})
    listOutgoing().then(setOutgoing).catch(() => {})
    getRelay().then(setRelay).catch(() => {})
  }, [])

  const sent = (id?: string | null) => (id ? relay?.sent.find((x) => x.id === id) : undefined)
  const refused = (relay?.received ?? []).filter((r) => r.status === 'refused')
  const invitations = (relay?.received ?? []).filter((r) => r.status === 'new' && r.invitation)
  const reload = () => getRelay().then(setRelay).catch(() => {})
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
        box: (o.exportedAt && !['queued', 'attention'].includes(sent(o.relayPackageId)?.stage ?? '') ? 'sent' : 'outbox') as 'sent' | 'outbox',
        state: sent(o.relayPackageId) ? m[`relay.stage_${sent(o.relayPackageId)!.stage}`]() : undefined,
        party: o.stationName ?? '',
        at: o.exportedAt ?? o.preparedAt,
        subject: `${outgoingKindLabels[o.kind] ?? o.kind}${o.policeReference ? `: ${o.policeReference}` : ''}`,
        preview: o.summary,
        body: <p className="whitespace-pre-wrap">{o.summary}</p>,
      })),
    ],
    [incoming, outgoing, relay],
  )
  const all = useMemo<PostboxMessage[]>(
    () => [
      ...messages,
      ...invitations.map((r) => ({
        id: r.id,
        box: 'inbox' as const,
        unread: true,
        party: r.from,
        at: r.arrivedAt,
        subject: m['relay.invitation']({ name: r.invitation!.name, kind: r.invitation!.kind }),
        preview: r.invitation!.fingerprint,
        body: (
          <div className="flex flex-col gap-3">
            <p>{m['relay.invitation_body']({ fingerprint: r.invitation!.fingerprint })}</p>
            <div className="flex gap-2">
              <Button size="sm" onClick={() => answerCourtInvitation(r.id).then(reload).catch(() => {})}>
                {m['relay.answer']()}
              </Button>
              <Button size="sm" variant="secondary" onClick={() => declineCourtInvitation(r.id).then(setRelay).catch(() => {})}>
                {m['relay.decline']()}
              </Button>
            </div>
          </div>
        ),
      })),
      ...refused.map((r) => ({ id: r.id, box: 'inbox' as const, unread: true, party: r.from, at: r.arrivedAt, subject: m['relay.turned_away']({ kind: r.kind }), preview: r.reason ?? '', body: <p className="whitespace-pre-wrap text-destructive">{r.reason}</p>, state: m['relay.stage_attention']() })),
    ],
    [messages, refused, invitations],
  )

  return (
    <PostboxView
      header={<ReceivingAddress labels={{ title: m['relay.address_title'](), hint: m['relay.address_hint'](), copy: m['relay.address_copy'](), copied: m['relay.address_copied'](), unknown: m['relay.address_unknown']() }} address={relay?.ready ? relay.address : null} name={relay?.name} />}
      labels={{ ...labels, status: relay === null ? m['relay.checking']() : relay.ready ? m['relay.connected']({ address: relay.address ?? '' }) : (relay.whyNot ?? labels.status) }}
      messages={all}
      actions={
        <Button size="sm" variant="secondary" onClick={() => checkRelay().then(setRelay).then(() => listIncoming().then(setIncoming)).then(() => listOutgoing().then(setOutgoing)).catch(() => {})}>
          {m['relay.check_now']()}
        </Button>
      }
    />
  )
}
