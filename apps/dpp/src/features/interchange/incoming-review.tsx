import { EmptyNote } from '@/components/planned'
import { Tag } from '@/components/status-tag'
import { ApiError } from '@/lib/api'
import { Button } from '@pleadli/ui/button'
import { Input } from '@pleadli/ui/input'
import { t } from '@pleadli/ui/goey-toaster'
import { Textarea } from '@pleadli/ui/textarea'
import { useMutation } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { format } from 'date-fns/format'
import { useState } from 'react'
import { acceptIncoming, rejectIncoming } from './data'
import { useIncomingDetail } from './queries'
import { roleLabels } from './schema'

const say = (error: unknown) => (error instanceof ApiError ? error.message : 'Please try again.')

function size(bytes: number) {
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

/** A referral read before it is anything else: what it claims, who says so, and
 * exactly what accepting it would create. Nothing here is a DPP record. */
export function IncomingReview({ id }: { id: string }) {
  const { data: p } = useIncomingDetail(id)
  const navigate = useNavigate()
  const { payload } = p
  const decided = p.status !== 'received'
  const [title, setTitle] = useState('')
  const [registration, setRegistration] = useState('')
  const [matches, setMatches] = useState<Record<string, string | null>>({})
  const [reason, setReason] = useState('')
  const personName = (key: string) => {
    const person = payload.people.find((x) => x.key === key)
    return person ? `${person.lastName}, ${person.firstName}` : 'Unknown'
  }

  const accept = useMutation({
    mutationFn: () => acceptIncoming(id, { title, odppRegistrationNumber: registration, personMatches: matches }),
    onSuccess: (r) => {
      t.success(r.attachmentsFailed > 0 ? `File opened. ${r.attachmentsFailed} documents could not be attached.` : 'File opened. A receipt is ready to send.')
      void navigate({ to: '/files/$fileId', params: { fileId: r.fileId } })
    },
    onError: (e) => t.error('Could not accept it', { description: say(e) }),
  })
  const reject = useMutation({
    mutationFn: () => rejectIncoming(id, reason),
    onSuccess: () => {
      t.success('Rejected. A receipt with your reason is ready to send.')
      void navigate({ to: '/incoming' })
    },
    onError: (e) => t.error('Could not reject it', { description: say(e) }),
  })

  return (
    <article className="page">
      <header className="page-header">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1>{payload.policeReference}</h1>
            <Tag tone={p.status === 'received' ? 'open' : p.status === 'accepted' ? 'done' : 'stopped'}>{p.status === 'received' ? 'Waiting to be read' : p.status === 'accepted' ? 'Accepted' : 'Rejected'}</Tag>
            {payload.resubmissionOf && <Tag tone="waiting">Resubmission</Tag>}
          </div>
          <p>Referred by {p.stationName ?? payload.stationName}
            {payload.referringOfficer ? `, ${payload.referringOfficer}` : ''}. Received {format(p.receivedAt, 'PPp')}.</p>
        </div>
      </header>

      <section aria-label="Where this came from" className="flex flex-col gap-2 rounded-lg border bg-card p-4">
        <h3>Who says so</h3>
        <dl className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2 lg:grid-cols-4">
          <div className="flex flex-col"><dt className="text-xs text-muted-foreground">Signed by station</dt><dd>{p.stationName}</dd></div>
          <div className="flex flex-col"><dt className="text-xs text-muted-foreground">Key fingerprint</dt><dd className="font-mono text-xs">{p.senderFingerprint}</dd></div>
          <div className="flex flex-col"><dt className="text-xs text-muted-foreground">Sent</dt><dd>{format(p.sentAt, 'PPp')}, package {p.seq}</dd></div>
          <div className="flex min-w-0 flex-col"><dt className="text-xs text-muted-foreground">SHA-256 of the package</dt><dd className="truncate font-mono text-xs" title={p.packageSha256}>{p.packageSha256}</dd></div>
        </dl>
        <p>The signature was checked against the key this office confirmed for that station, and the package is sealed to this office. What is inside is still the station's claim.</p>
        {p.nameDiffers && <p className="flex items-center gap-2"><Tag tone="urgent">Name differs</Tag> The referral names the station "{payload.stationName}", but the connection was confirmed as "{p.stationName}".</p>}
        {p.missingBefore > 0 && <p className="flex items-center gap-2"><Tag tone="open">Gap</Tag> {p.missingBefore === 1 ? 'A package' : `${p.missingBefore} packages`} numbered before this one from this station {p.missingBefore === 1 ? 'has' : 'have'} not been received here.</p>}
        {p.connectionState !== 'trusted' && <p className="flex items-center gap-2"><Tag tone="urgent">Not trusted</Tag> This station's connection is no longer trusted, so this cannot be accepted.</p>}
      </section>

      <section className="page-section">
        <h2>The station's summary</h2>
        <p className="whitespace-pre-wrap text-foreground">{payload.summary}</p>
        {payload.notes && <p className="whitespace-pre-wrap">{payload.notes}</p>}
      </section>

      <section className="page-section">
        <h2>People</h2>
        <div role="list" className="flex flex-col divide-y divide-border/60 border-y border-border/60">
          {payload.people.map((person) => {
            const match = p.matches.find((m) => m.personKey === person.key)
            return (
              <div key={person.key} role="listitem" className="flex flex-col gap-1 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Tag tone="neutral">{roleLabels[person.role] ?? person.role}</Tag>
                  <strong>{person.lastName}, {person.firstName}</strong>
                  {person.nationalId && <span className="text-muted-foreground">NIN {person.nationalId}</span>}
                </div>
                {match && !decided && (
                  <label className="flex flex-wrap items-center gap-2">
                    <Tag tone="open">Already here</Tag>
                    <span>{match.existingName} has the same national ID.</span>
                    <select className="h-8 rounded-md border border-input bg-input/20 px-2" value={matches[person.key] ?? ''} onChange={(e) => setMatches({ ...matches, [person.key]: e.target.value || null })}>
                      <option value="">Add as a new person</option>
                      <option value={match.existingPersonId}>Use {match.existingName}</option>
                    </select>
                  </label>
                )}
              </div>
            )
          })}
        </div>
      </section>

      <section className="page-section">
        <h2>Statements</h2>
        {payload.statements.length === 0 ? <EmptyNote>None.</EmptyNote> : (
          <div role="list" className="flex flex-col divide-y divide-border/60 border-y border-border/60">
            {payload.statements.map((s) => (
              <div key={s.key} role="listitem" className="flex flex-col gap-1 py-3">
                <div className="flex flex-wrap items-center gap-2"><Tag tone="neutral">{roleLabels[s.role] ?? s.role}</Tag><strong>{personName(s.personKey)}</strong><span className="text-muted-foreground">{format(s.givenAt, 'PP')}{s.takenBy ? `, taken by ${s.takenBy}` : ''}</span></div>
                <p className="whitespace-pre-wrap text-foreground">{s.content}</p>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="page-section">
        <h2>Exhibits</h2>
        {payload.exhibits.length === 0 ? <EmptyNote>None.</EmptyNote> : (
          <div role="list" className="flex flex-col divide-y divide-border/60 border-y border-border/60">
            {payload.exhibits.map((e) => (
              <div key={e.key} role="listitem" className="flex flex-col gap-1 py-3"><strong>{e.description}</strong><p>{[e.identificationMark, e.recoveredFromLocation].filter(Boolean).join('. ')}</p></div>
            ))}
          </div>
        )}
      </section>

      <section className="page-section">
        <h2>Proposed charges</h2>
        {payload.charges.length === 0 ? <EmptyNote>None.</EmptyNote> : (
          <div role="list" className="flex flex-col divide-y divide-border/60 border-y border-border/60">
            {payload.charges.map((c, i) => (
              <div key={i} role="listitem" className="flex flex-col gap-1 py-3">
                <div className="flex flex-wrap items-center gap-2"><strong>{c.offence}</strong>{c.statutorySection && <Tag tone="neutral">{c.statutorySection}</Tag>}{c.accusedPersonKey && <span className="text-muted-foreground">{personName(c.accusedPersonKey)}</span>}</div>
                {c.particulars && <p className="whitespace-pre-wrap">{c.particulars}</p>}
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="page-section">
        <h2>Files with it</h2>
        {p.files.length === 0 ? <EmptyNote>No files came with this referral.</EmptyNote> : (
          <div role="list" className="flex flex-col divide-y divide-border/60 border-y border-border/60">
            {p.files.map((f) => (
              <div key={f.id} role="listitem" className="flex flex-wrap items-center justify-between gap-2 py-2"><span>{f.name}</span><span className="text-muted-foreground">{f.mime}, {size(f.size)}</span></div>
            ))}
          </div>
        )}
        <p>Files are kept sealed and were checked against their hashes. They are attached to the records only when you accept.</p>
      </section>

      {payload.resubmissionOf && (
        <section className="page-section">
          <h2>What this answers</h2>
          {p.resubmissionTarget ? (
            <p>
              A resubmission of <Link to="/files/$fileId" params={{ fileId: p.resubmissionTarget.fileId }} className="text-foreground">{p.resubmissionTarget.title}</Link>, which is {p.resubmissionTarget.status === 'returned_for_investigation' ? 'with the station' : `${p.resubmissionTarget.status.replace(/_/g, ' ')}, not with the station, so it cannot be accepted`}. Accepting adds this material to that file. It does not open a new one.
            </p>
          ) : (
            <p className="flex items-center gap-2"><Tag tone="urgent">Unknown file</Tag> It names a file this station did not refer, so it cannot be accepted.</p>
          )}
        </section>
      )}

      {!decided && (
        <section className="page-section rounded-lg border bg-card p-4">
          <h2>Decide</h2>
          <p>Accepting creates {payload.resubmissionOf ? 'the new material on the file' : 'a prosecution file'}: {payload.people.length} people, {payload.statements.length} statements, {payload.exhibits.length} exhibits, {payload.charges.length} proposed charges and {p.files.length} files, in one step. A receipt is then ready for the station.</p>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {!payload.resubmissionOf && (
              <>
                <label className="flex flex-col gap-1"><strong>Title of the file</strong><Input placeholder="Leave empty to use the suggested title" value={title} onChange={(e) => setTitle(e.target.value)} /></label>
                <label className="flex flex-col gap-1"><strong>ODPP registration number</strong><Input placeholder="If it has one (optional)" value={registration} onChange={(e) => setRegistration(e.target.value)} /></label>
              </>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button disabled={accept.isPending || p.connectionState !== 'trusted' || (Boolean(payload.resubmissionOf) && p.resubmissionTarget?.status !== 'returned_for_investigation')} onClick={() => accept.mutate()}>
              Accept and open the file
            </Button>
          </div>
          <div className="flex flex-col gap-2 border-t pt-4">
            <strong>Or reject it</strong>
            <Textarea aria-label="Reason for rejecting" placeholder="Why it is being rejected. The station is told." value={reason} onChange={(e) => setReason(e.target.value)} />
            <Button variant="outline" className="w-fit" disabled={reject.isPending || !reason.trim()} onClick={() => reject.mutate()}>Reject the referral</Button>
          </div>
        </section>
      )}
      {decided && p.prosecutionFileId && <p><Link to="/files/$fileId" params={{ fileId: p.prosecutionFileId }} className="text-primary">Open the file</Link></p>}
    </article>
  )
}
