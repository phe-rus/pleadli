import * as m from '@/paraglide/messages'
import { listIncoming, listOutgoing, type Incoming, type Outgoing } from '@/features/exchange/data'
import { checkRelay, getRelay, type RelayStatus } from '@/features/relay/data'
import { PostboxView, type PostboxLabels, type PostboxMessage } from '@pleadli/shell'
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

const field = (body: Record<string, string | undefined>, ...keys: string[]) => keys.map((k) => body[k]).filter(Boolean).join(' · ')

function parse(payload: string): Record<string, string | undefined> {
  try {
    return JSON.parse(payload)
  } catch {
    return {}
  }
}

function RouteComponent() {
  const labels = useLabels()
  const [incoming, setIncoming] = useState<Incoming[]>([])
  const [outgoing, setOutgoing] = useState<Outgoing[]>([])
  const [relay, setRelay] = useState<RelayStatus | null>(null)
  useEffect(() => {
    // Before the station has an exchange identity these answer with nothing.
    listIncoming().then(setIncoming).catch(() => {})
    listOutgoing().then(setOutgoing).catch(() => {})
    getRelay().then(setRelay).catch(() => {})
  }, [])

  const stage = (id: string) => relay?.sent.find((x) => x.id === id)
  const messages = useMemo<PostboxMessage[]>(
    () => [
      ...incoming.map((i) => {
        const body = parse(i.payload)
        const subject = i.kind === 'receipt' ? m['exchange.receipt']() : m['exchange.decision']()
        return { id: i.id, box: 'inbox' as const, unread: true, party: i.officeName, at: i.receivedAt, subject: `${subject}: ${body.policeReference ?? ''}`.trim(), preview: field(body, 'outcome', 'decisionType', 'dppReference', 'reason'), body: <p className="whitespace-pre-wrap">{field(body, 'policeReference', 'outcome', 'decisionType', 'dppReference', 'reason')}</p> }
      }),
      ...outgoing.map((o) => ({
        id: o.id,
        box: (o.route === 'postbox' && (!o.exportedAt || ['queued', 'attention'].includes(stage(o.id)?.stage ?? '')) ? 'outbox' : 'sent') as 'outbox' | 'sent',
        party: o.officeName,
        at: o.exportedAt ?? o.preparedAt,
        subject: m['postbox.referral_subject']({ reference: o.policeReference ?? '' }),
        preview: o.route === 'postbox' ? m['postbox.by_postbox']() : m['postbox.by_file'](),
        body: <p>{m['postbox.referral_body']({ office: o.officeName })}</p>,
        state: o.route === 'postbox' ? (stage(o.id) ? m[`relay.stage_${stage(o.id)!.stage}`]() : m['postbox.by_postbox']()) : m['postbox.by_file'](),
      })),
    ],
    [incoming, outgoing, relay],
  )

  return <PostboxView labels={relay?.ready ? { ...labels, status: m['relay.connected']({ address: relay.address ?? '' }) } : labels} messages={messages} actions={<><Button size="sm" variant="secondary" onClick={() => checkRelay().then(setRelay).then(() => listIncoming().then(setIncoming)).then(() => listOutgoing().then(setOutgoing)).catch(() => {})}>{m['relay.check_now']()}</Button><Link to="/exchange" className={buttonVariants({ variant: 'secondary', size: 'sm' })}>{m['exchange.title']()}</Link></>} />
}
