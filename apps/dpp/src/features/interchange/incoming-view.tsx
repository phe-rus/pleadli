import { HugeiconsIcon } from '@hugeicons/react'
import { InboxIcon } from '@hugeicons/core-free-icons'
import { formatDate } from '@/lib/dates'
import { EmptyNote } from '@/components/planned'
import { Row, RowList } from '@/components/operational-row'
import { Tag } from '@/components/status-tag'
import { ApiError } from '@/lib/api'
import { Button } from '@pleadli/ui/button'
import { t } from '@pleadli/ui/goey-toaster'
import { useMutation } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { saveFile } from './data'
import { ImportButton } from './import-button'
import { useIncoming, useOutgoing } from './queries'
import { outgoingKindLabels, type Outgoing } from './schema'
import * as m from '@/paraglide/messages'

function OutgoingRow({ item }: { item: Outgoing }) {
  const save = useMutation({
    mutationFn: () => saveFile('outgoing', item.id),
    onSuccess: (saved) => saved && t.success(m["interchange.out.saved"]()),
    onError: (e) => t.error(m["interchange.out.save_failed"](), { description: e instanceof ApiError ? e.message : typeof e === 'string' ? e : m["common.try_again"]() }),
  })
  return (
    <Row
      title={`${outgoingKindLabels[item.kind] ?? item.kind}: ${item.summary.replace(/^[^:]+: /, '')}`}
      summary={`${m["interchange.out.to"]({ station: item.stationName ?? m["interchange.a_station"]() })}${item.policeReference ? `. ${item.policeReference}` : ''}. ${m["interchange.out.prepared"]({ date: formatDate(item.preparedAt, 'datetime') })}${item.exportedAt ? `. ${m["interchange.out.saved_on"]({ date: formatDate(item.exportedAt, 'datetime') })}` : ''}.`}
      trailing={
        <>
          <Tag tone={item.exportedAt ? 'done' : 'open'}>{item.exportedAt ? m["interchange.out.saved_to_send"]() : m["interchange.out.not_sent"]()}</Tag>
          <Button size="sm" variant="outline" disabled={save.isPending} onClick={() => save.mutate()}>
            {item.exportedAt ? m["interchange.out.save_again"]() : m["interchange.out.save"]()}
          </Button>
        </>
      }
    />
  )
}

/** What has arrived from stations, waiting to be read, and what this office has
 * prepared to send back. Nothing that arrives is a record until it is accepted. */
export function IncomingView() {
  const { data: incoming } = useIncoming()
  const { data: outgoing } = useOutgoing()
  const navigate = useNavigate()
  const waiting = incoming.filter((p) => p.status === 'received')
  const decided = incoming.filter((p) => p.status !== 'received')
  const toSend = outgoing.filter((o) => o.kind !== 'pairing_confirmation' && !o.exportedAt)
  const confirmations = outgoing.filter((o) => o.kind === 'pairing_confirmation' && !o.exportedAt)

  return (
    <article className="page">
      <header className="page-header">
        <div>
          <h1>{m["nav.item.inbox"]()}</h1>
          <p>{m["interchange.in.subtitle"]()}</p>
        </div>
        <div className="page-actions">
          <ImportButton onImported={(o) => o.packageId && void navigate({ to: '/incoming/$packageId', params: { packageId: o.packageId } })} />
        </div>
      </header>

      <section className="page-section">
        <div className="section-head">
          <h2>{m["interchange.status.waiting"]()}</h2>
          {waiting.length > 0 && <Tag tone="open">{waiting.length}</Tag>}
        </div>
        {waiting.length === 0 ? (
          <EmptyNote icon={<HugeiconsIcon icon={InboxIcon} />}>{m["interchange.in.empty"]()}</EmptyNote>
        ) : (
          <RowList>
            {waiting.map((p) => (
              <Row
                key={p.id}
                marker="open"
                title={p.policeReference ?? m["interchange.referral"]()}
                summary={m["interchange.in.from_received"]({ station: p.stationName ?? m["interchange.a_station"](), date: formatDate(p.receivedAt, 'datetime') })}
                trailing={
                  <>
                    {p.resubmission && <Tag tone="waiting">{m["interchange.resubmission"]()}</Tag>}
                    <Link to="/incoming/$packageId" params={{ packageId: p.id }} className="text-primary">{m["interchange.read"]()}</Link>
                  </>
                }
              />
            ))}
          </RowList>
        )}
      </section>

      {/* Only when there is something to send: an empty outbox says nothing. */}
      {outgoing.length > 0 && (
      <section className="page-section">
        <div className="section-head">
          <h2>{m["interchange.in.to_send"]()}</h2>
          {toSend.length + confirmations.length > 0 && <Tag tone="open">{toSend.length + confirmations.length}</Tag>}
        </div>
        <p>{m["interchange.in.to_send_hint"]()}</p>
        {outgoing.length === 0 ? (
          <EmptyNote>{m["interchange.in.nothing_prepared"]()}</EmptyNote>
        ) : (
          <RowList>
            {outgoing.map((o) => (
              <OutgoingRow key={o.id} item={o} />
            ))}
          </RowList>
        )}
      </section>
      )}

      {decided.length > 0 && (
        <section className="page-section">
          <h2>{m["interchange.in.decided"]()}</h2>
          <RowList>
            {decided.map((p) => (
              <Row
                key={p.id}
                title={p.policeReference ?? m["interchange.referral"]()}
                summary={`${m["interchange.in.from"]({ station: p.stationName ?? m["interchange.a_station"]() })} ${p.status === 'accepted' ? m["interchange.status.accepted"]() : m["interchange.status.rejected"]()} ${p.decidedAt ? formatDate(p.decidedAt) : ''}${p.decidedBy ? `, ${p.decidedBy}` : ''}${p.rejectReason ? `. ${p.rejectReason}` : ''}.`}
                trailing={
                  <>
                    <Tag tone={p.status === 'accepted' ? 'done' : 'stopped'}>{p.status === 'accepted' ? m["interchange.status.accepted"]() : m["interchange.status.rejected"]()}</Tag>
                    {p.prosecutionFileId ? (
                      <Link to="/files/$fileId" params={{ fileId: p.prosecutionFileId }} className="text-primary">{m["interchange.open_file"]()}</Link>
                    ) : (
                      <Link to="/incoming/$packageId" params={{ packageId: p.id }} className="text-primary">{m["interchange.read"]()}</Link>
                    )}
                  </>
                }
              />
            ))}
          </RowList>
        </section>
      )}
    </article>
  )
}
