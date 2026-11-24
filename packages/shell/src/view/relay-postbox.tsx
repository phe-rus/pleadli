import { Button } from '@pleadli/ui/button'
import { useMemo, useState, type ReactNode } from 'react'
import { PostboxView, type PostboxLabels, type PostboxMessage } from './postbox'
import { ReceivingAddress, type ReceivingAddressLabels } from './receiving-address'

/** What one office's postbox reports (the same shape from every app's relay route). */
export type RelaySent = { id: string; to: string; kind: string; stage: 'queued' | 'sent' | 'delivered' | 'refused' | 'attention' | 'expired'; error: string | null; attempts: number; queuedAt: number; postedAt: number | null; ackedAt: number | null }
export type RelayInvitation = { fingerprint: string; name: string; kind: string; intendedFor: string; expiresAt: number }
export type RelayReceived = { id: string; from: string; kind: string; size: number; status: 'new' | 'imported' | 'refused'; reason: string | null; arrivedAt: number; handledAt: number | null; invitation?: RelayInvitation | null }
export type RelayStatus = { ready: boolean; whyNot: string | null; address: string | null; name?: string | null; site: string; last: { at: number | null; error: string | null }; sent: RelaySent[]; received: RelayReceived[] }

/** The application's own words. Nothing here is shared vocabulary: each app says it in its own voice and languages. */
export type RelayLabels = {
  postbox: PostboxLabels
  address: ReceivingAddressLabels
  checkNow: string
  checking: string
  connected: (address: string) => string
  stage: Record<RelaySent['stage'], string>
  turnedAway: (kind: string) => string
  taken: string
  tryAgain: string
  invitation: (name: string, kind: string) => string
  invitationBody: (fingerprint: string) => string
  answer: string
  decline: string
  lastError: (reason: string) => string
}

/**
 * The postbox with the relay's own picture in it: what is waiting to be sent, what was sent and how far it got,
 * what arrived, what was turned away and why, and invitations that wait for a person. Props only: the app supplies
 * the calls. A turned-away package shows the reason and can be tried again once its cause is fixed.
 */
export function RelayPostbox({
  labels,
  relay,
  kindLabels = {},
  onCheck,
  onReopen,
  onAnswer,
  onDecline,
  extra,
}: {
  labels: RelayLabels
  relay: RelayStatus | null
  /** The app's own words for each kind of package. Unknown kinds show as they are. */
  kindLabels?: Record<string, string>
  onCheck: () => Promise<unknown>
  onReopen?: (id: string) => Promise<unknown>
  onAnswer?: (id: string) => Promise<unknown>
  onDecline?: (id: string) => Promise<unknown>
  extra?: ReactNode
}) {
  const [busy, setBusy] = useState(false)
  const run = async (f?: () => Promise<unknown>) => {
    if (!f || busy) return
    setBusy(true)
    try {
      await f()
    } catch {
      // The app shows its own error in the status line on the next check.
    } finally {
      setBusy(false)
    }
  }
  const kind = (k: string) => kindLabels[k] ?? k

  const messages = useMemo<PostboxMessage[]>(() => {
    if (!relay) return []
    const sent: PostboxMessage[] = relay.sent.map((s) => ({
      id: s.id,
      box: s.stage === 'queued' || s.stage === 'attention' ? 'outbox' : 'sent',
      party: s.to,
      at: s.postedAt ?? s.queuedAt,
      subject: kind(s.kind),
      preview: s.error ?? '',
      state: labels.stage[s.stage],
      body: <p className="whitespace-pre-wrap">{s.error ? labels.lastError(s.error) : labels.stage[s.stage]}</p>,
    }))
    const received: PostboxMessage[] = relay.received.map((r) => {
      if (r.invitation && r.status === 'new') {
        return {
          id: r.id,
          box: 'inbox' as const,
          unread: true,
          party: r.from,
          at: r.arrivedAt,
          subject: labels.invitation(r.invitation.name, r.invitation.kind),
          preview: r.invitation.fingerprint,
          body: (
            <div className="flex flex-col gap-3">
              <p>{labels.invitationBody(r.invitation.fingerprint)}</p>
              <div className="flex gap-2">
                {onAnswer && (
                  <Button size="sm" disabled={busy} onClick={() => run(() => onAnswer(r.id))}>
                    {labels.answer}
                  </Button>
                )}
                {onDecline && (
                  <Button size="sm" variant="secondary" disabled={busy} onClick={() => run(() => onDecline(r.id))}>
                    {labels.decline}
                  </Button>
                )}
              </div>
            </div>
          ),
        }
      }
      if (r.status === 'refused') {
        return {
          id: r.id,
          box: 'inbox' as const,
          unread: true,
          party: r.from,
          at: r.arrivedAt,
          subject: labels.turnedAway(kind(r.kind)),
          preview: r.reason ?? '',
          state: labels.stage.attention,
          body: (
            <div className="flex flex-col gap-3">
              <p className="whitespace-pre-wrap text-destructive">{r.reason}</p>
              {onReopen && (
                <Button size="sm" variant="secondary" className="w-fit" disabled={busy} onClick={() => run(() => onReopen(r.id))}>
                  {labels.tryAgain}
                </Button>
              )}
            </div>
          ),
        }
      }
      return { id: r.id, box: 'inbox' as const, unread: r.status === 'new', party: r.from, at: r.arrivedAt, subject: kind(r.kind), preview: labels.taken, body: <p>{labels.taken}</p> }
    })
    return [...received, ...sent].sort((a, b) => b.at - a.at)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [relay, busy, labels, kindLabels])

  const status = relay === null ? labels.checking : relay.ready ? labels.connected(relay.address ?? '') : (relay.whyNot ?? labels.postbox.status)
  return (
    <PostboxView
      header={<ReceivingAddress labels={labels.address} address={relay?.ready ? relay.address : null} name={relay?.name} />}
      labels={{ ...labels.postbox, status: relay?.last.error ? `${status} ${labels.lastError(relay.last.error)}` : status, sent: labels.postbox.sent ?? { label: labels.stage.sent, empty: '' } }}
      messages={messages}
      actions={
        <div className="flex items-center gap-2">
          {extra}
          <Button size="sm" variant="secondary" disabled={busy} onClick={() => run(onCheck)}>
            {labels.checkNow}
          </Button>
        </div>
      }
    />
  )
}
