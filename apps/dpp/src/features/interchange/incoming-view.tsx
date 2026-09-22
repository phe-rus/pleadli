import { EmptyNote } from '@/components/planned'
import { Row, RowList } from '@/components/operational-row'
import { Tag } from '@/components/status-tag'
import { ApiError } from '@/lib/api'
import { Button } from '@pleadli/ui/button'
import { t } from '@pleadli/ui/goey-toaster'
import { useMutation } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { format } from 'date-fns/format'
import { saveFile } from './data'
import { ImportButton } from './import-button'
import { useIncoming, useOutgoing } from './queries'
import { outgoingKindLabels, type Outgoing } from './schema'

function OutgoingRow({ item }: { item: Outgoing }) {
  const save = useMutation({
    mutationFn: () => saveFile('outgoing', item.id),
    onSuccess: (saved) => saved && t.success('Saved. Send the file to the station.'),
    onError: (e) => t.error('Could not save it', { description: e instanceof ApiError ? e.message : typeof e === 'string' ? e : 'Please try again.' }),
  })
  return (
    <Row
      title={`${outgoingKindLabels[item.kind] ?? item.kind}: ${item.summary.replace(/^[^:]+: /, '')}`}
      summary={`To ${item.stationName ?? 'a station'}${item.policeReference ? `. ${item.policeReference}` : ''}. Prepared ${format(item.preparedAt, 'PPp')}${item.exportedAt ? `. Saved ${format(item.exportedAt, 'PPp')}` : ''}.`}
      trailing={
        <>
          <Tag tone={item.exportedAt ? 'done' : 'open'}>{item.exportedAt ? 'Saved to send' : 'Not sent yet'}</Tag>
          <Button size="sm" variant="outline" disabled={save.isPending} onClick={() => save.mutate()}>
            {item.exportedAt ? 'Save again' : 'Save the file'}
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
          <h1>Incoming</h1>
          <p>Referrals from the stations this office trusts. They wait here, held apart from the records, until you read and accept them.</p>
        </div>
        <div className="page-actions">
          <ImportButton onImported={(o) => o.packageId && void navigate({ to: '/incoming/$packageId', params: { packageId: o.packageId } })} />
        </div>
      </header>

      <section className="page-section">
        <div className="section-head">
          <h2>Waiting to be read</h2>
          {waiting.length > 0 && <Tag tone="open">{waiting.length}</Tag>}
        </div>
        {waiting.length === 0 ? (
          <EmptyNote>Nothing is waiting. Import a package a station has sent.</EmptyNote>
        ) : (
          <RowList>
            {waiting.map((p) => (
              <Row
                key={p.id}
                marker="open"
                title={p.policeReference ?? 'Referral'}
                summary={`From ${p.stationName ?? 'a station'}. Received ${format(p.receivedAt, 'PPp')}.`}
                trailing={
                  <>
                    {p.resubmission && <Tag tone="waiting">Resubmission</Tag>}
                    <Link to="/incoming/$packageId" params={{ packageId: p.id }} className="text-primary">Read</Link>
                  </>
                }
              />
            ))}
          </RowList>
        )}
      </section>

      <section className="page-section">
        <div className="section-head">
          <h2>To send back</h2>
          {toSend.length + confirmations.length > 0 && <Tag tone="open">{toSend.length + confirmations.length}</Tag>}
        </div>
        <p>Receipts, decision notices and connection confirmations. Each is signed by this office and sealed so only the station can read it. Save the file and send it by any means.</p>
        {outgoing.length === 0 ? (
          <EmptyNote>Nothing has been prepared. A receipt is prepared when you accept or reject a referral; a decision notice is prepared from the file's Decisions tab.</EmptyNote>
        ) : (
          <RowList>
            {outgoing.map((o) => (
              <OutgoingRow key={o.id} item={o} />
            ))}
          </RowList>
        )}
      </section>

      {decided.length > 0 && (
        <section className="page-section">
          <h2>Decided</h2>
          <RowList>
            {decided.map((p) => (
              <Row
                key={p.id}
                title={p.policeReference ?? 'Referral'}
                summary={`From ${p.stationName ?? 'a station'}. ${p.status === 'accepted' ? 'Accepted' : 'Rejected'} ${p.decidedAt ? format(p.decidedAt, 'PP') : ''}${p.decidedBy ? `, ${p.decidedBy}` : ''}${p.rejectReason ? `. ${p.rejectReason}` : ''}.`}
                trailing={
                  <>
                    <Tag tone={p.status === 'accepted' ? 'done' : 'stopped'}>{p.status === 'accepted' ? 'Accepted' : 'Rejected'}</Tag>
                    {p.prosecutionFileId ? (
                      <Link to="/files/$fileId" params={{ fileId: p.prosecutionFileId }} className="text-primary">Open the file</Link>
                    ) : (
                      <Link to="/incoming/$packageId" params={{ packageId: p.id }} className="text-primary">Read</Link>
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
