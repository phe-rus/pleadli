import { ChoiceSelect } from '@/components/choice-select'
import { formatDate } from '@/lib/dates'
import { referenceLabel } from '@/lib/jurisdiction'
import { EmptyNote } from '@/components/planned'
import { Tag } from '@/components/status-tag'
import { ApiError } from '@/lib/api'
import { Button } from '@pleadli/ui/button'
import { Input } from '@pleadli/ui/input'
import { t } from '@pleadli/ui/goey-toaster'
import { Textarea } from '@pleadli/ui/textarea'
import { CountedTabs, RecordHeader } from '@pleadli/shell'
import { useMutation } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { acceptIncoming, rejectIncoming } from './data'
import { useIncomingDetail } from './queries'
import { fileStatusLabel } from '@/features/prosecution-files/schema'
import { roleLabels } from './schema'
import * as m from '@/paraglide/messages'

const say = (error: unknown) => (error instanceof ApiError ? error.message : m["common.try_again"]())

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
    return person ? `${person.lastName}, ${person.firstName}` : m["interchange.review.unknown"]()
  }

  const accept = useMutation({
    mutationFn: () => acceptIncoming(id, { title, odppRegistrationNumber: registration, personMatches: matches }),
    onSuccess: (r) => {
      t.success(r.attachmentsFailed > 0 ? m["interchange.review.opened_failed"]({ count: r.attachmentsFailed }) : m["interchange.review.opened"]())
      void navigate({ to: '/files/$fileId', params: { fileId: r.fileId } })
    },
    onError: (e) => t.error(m["interchange.review.accept_failed"](), { description: say(e) }),
  })
  const reject = useMutation({
    mutationFn: () => rejectIncoming(id, reason),
    onSuccess: () => {
      t.success(m["interchange.review.rejected_toast"]())
      void navigate({ to: '/incoming' })
    },
    onError: (e) => t.error(m["interchange.review.reject_failed"](), { description: say(e) }),
  })

  const summaryTab = (
      <section className="flex flex-col gap-3">
        <p className="whitespace-pre-wrap text-foreground">{payload.summary}</p>
        {payload.notes && <p className="whitespace-pre-wrap">{payload.notes}</p>}
      </section>
  )

  const peopleTab = (
      <section className="flex flex-col gap-3">
        <div role="list" className="flex flex-col divide-y divide-border/60 border-y border-border/60">
          {payload.people.map((person) => {
            const match = p.matches.find((x) => x.personKey === person.key)
            return (
              <div key={person.key} role="listitem" className="flex flex-col gap-1 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Tag tone="neutral">{roleLabels[person.role] ?? person.role}</Tag>
                  <strong>{person.lastName}, {person.firstName}</strong>
                  {person.nationalId && <span className="text-muted-foreground">{m["interchange.review.nin"]({ nin: person.nationalId })}</span>}
                </div>
                {match && !decided && (
                  <label className="flex flex-wrap items-center gap-2">
                    <Tag tone="open">{m["interchange.review.already_here"]()}</Tag>
                    <span>{m["interchange.review.same_nin"]({ name: match.existingName })}</span>
                    <ChoiceSelect className="h-8 rounded-md border border-input bg-input/20 px-2" value={matches[person.key] ?? ''} onChange={(e) => setMatches({ ...matches, [person.key]: e.target.value || null })}>
                      <option value="">{m["interchange.review.add_new"]()}</option>
                      <option value={match.existingPersonId}>{m["interchange.review.use_existing"]({ name: match.existingName })}</option>
                    </ChoiceSelect>
                  </label>
                )}
              </div>
            )
          })}
        </div>
      </section>
  )

  const statementsTab = (
      <section className="flex flex-col gap-3">
        {payload.statements.length === 0 ? <EmptyNote>{m["common.none"]()}</EmptyNote> : (
          <div role="list" className="flex flex-col divide-y divide-border/60 border-y border-border/60">
            {payload.statements.map((s) => (
              <div key={s.key} role="listitem" className="flex flex-col gap-1 py-3">
                <div className="flex flex-wrap items-center gap-2"><Tag tone="neutral">{roleLabels[s.role] ?? s.role}</Tag><strong>{personName(s.personKey)}</strong><span className="text-muted-foreground">{formatDate(s.givenAt)}{s.takenBy ? `, ${m["interchange.review.taken_by"]({ name: s.takenBy })}` : ''}</span></div>
                <p className="whitespace-pre-wrap text-foreground">{s.content}</p>
              </div>
            ))}
          </div>
        )}
      </section>
  )

  const exhibitsTab = (
      <section className="flex flex-col gap-3">
        {payload.exhibits.length === 0 ? <EmptyNote>{m["common.none"]()}</EmptyNote> : (
          <div role="list" className="flex flex-col divide-y divide-border/60 border-y border-border/60">
            {payload.exhibits.map((e) => (
              <div key={e.key} role="listitem" className="flex flex-col gap-1 py-3"><strong>{e.description}</strong><p>{[e.identificationMark, e.recoveredFromLocation].filter(Boolean).join('. ')}</p></div>
            ))}
          </div>
        )}
      </section>
  )

  const chargesTab = (
      <section className="flex flex-col gap-3">
        {payload.charges.length === 0 ? <EmptyNote>{m["common.none"]()}</EmptyNote> : (
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
  )

  const filesTab = (
      <section className="flex flex-col gap-3">
        {p.files.length === 0 ? <EmptyNote>{m["interchange.review.no_files"]()}</EmptyNote> : (
          <div role="list" className="flex flex-col divide-y divide-border/60 border-y border-border/60">
            {p.files.map((f) => (
              <div key={f.id} role="listitem" className="flex flex-wrap items-center justify-between gap-2 py-2"><span>{f.name}</span><span className="text-muted-foreground">{f.mime}, {size(f.size)}</span></div>
            ))}
          </div>
        )}
        <p>{m["interchange.review.files_hint"]()}</p>
      </section>
  )

  return (
    <article className="page">
      <RecordHeader
        className="mb-4"
        crumb={<><Link to="/incoming" className="hover:underline">{m["nav.item.inbox"]()}</Link><span aria-hidden> / </span><span>{payload.policeReference}</span></>}
        title={payload.policeReference}
        tag={<>
          <Tag tone={p.status === 'received' ? 'open' : p.status === 'accepted' ? 'done' : 'stopped'}>{p.status === 'received' ? m["interchange.status.waiting"]() : p.status === 'accepted' ? m["interchange.status.accepted"]() : m["interchange.status.rejected"]()}</Tag>
          {payload.resubmissionOf && <Tag tone="waiting">{m["interchange.resubmission"]()}</Tag>}
        </>}
        subtitle={m["interchange.review.referred_by"]({ station: `${p.stationName ?? payload.stationName}${payload.referringOfficer ? `, ${payload.referringOfficer}` : ''}`, date: formatDate(p.receivedAt, 'datetime') })}
        copyLabel={m["file_ws.d_copy"]()}
        copiedLabel={m["file_ws.d_copied"]()}
        facts={[
          [
            { label: m["interchange.review.signed_by"](), value: p.stationName },
            { label: m["interchange.review.sent"](), value: m["interchange.review.sent_value"]({ date: formatDate(p.sentAt, 'datetime'), seq: p.seq }) },
          ],
          [
            { label: m["interchange.review.fingerprint"](), value: <span className="font-mono text-xs">{p.senderFingerprint}</span>, copy: p.senderFingerprint },
            { label: m["interchange.review.sha"](), value: <span className="font-mono text-xs" title={p.packageSha256}>{p.packageSha256}</span>, copy: p.packageSha256 },
          ],
        ]}
      />
      <section aria-label={m["interchange.review.origin"]()} className="mb-4 flex flex-col gap-1.5 text-sm text-muted-foreground">
        <p className="m-0">{m["interchange.review.signature_checked"]()}</p>
        {p.nameDiffers && <p className="m-0 flex items-center gap-2"><Tag tone="urgent">{m["interchange.review.name_differs"]()}</Tag> {m["interchange.review.name_differs_body"]({ named: payload.stationName, confirmed: p.stationName ?? "" })}</p>}
        {p.missingBefore > 0 && <p className="m-0 flex items-center gap-2"><Tag tone="open">{m["interchange.review.gap"]()}</Tag> {p.missingBefore === 1 ? m["interchange.review.gap_one"]() : m["interchange.review.gap_many"]({ count: p.missingBefore })}</p>}
        {p.connectionState !== 'trusted' && <p className="m-0 flex items-center gap-2"><Tag tone="urgent">{m["interchange.review.not_trusted"]()}</Tag> {m["interchange.review.not_trusted_body"]()}</p>}
      </section>

      <CountedTabs
        tabs={[
          { id: 'summary', label: m["interchange.review.summary"](), content: summaryTab },
          { id: 'people', label: m["nav.item.people"](), count: payload.people.length, content: peopleTab },
          { id: 'statements', label: m["interchange.review.statements"](), count: payload.statements.length, content: statementsTab },
          { id: 'exhibits', label: m["interchange.review.exhibits"](), count: payload.exhibits.length, content: exhibitsTab },
          { id: 'charges', label: m["interchange.review.charges"](), count: payload.charges.length, content: chargesTab },
          { id: 'files', label: m["interchange.review.files"](), count: p.files.length, content: filesTab },
        ]}
      />
      {payload.resubmissionOf && (
        <section className="page-section">
          <h2>{m["interchange.review.answers"]()}</h2>
          {p.resubmissionTarget ? (
            <p>
              {m["interchange.review.resubmission_of"]()} <Link to="/files/$fileId" params={{ fileId: p.resubmissionTarget.fileId }} className="text-foreground">{p.resubmissionTarget.title}</Link>. {p.resubmissionTarget.status === 'returned_for_investigation' ? m["interchange.review.with_station"]() : m["interchange.review.not_with_station"]({ status: fileStatusLabel(p.resubmissionTarget.status) })}
            </p>
          ) : (
            <p className="flex items-center gap-2"><Tag tone="urgent">{m["interchange.review.unknown_file"]()}</Tag> {m["interchange.review.unknown_file_body"]()}</p>
          )}
        </section>
      )}


      {!decided && (
        <section className="page-section rounded-lg border bg-card p-4">
          <h2>{m["interchange.review.decide"]()}</h2>
          <p>{(payload.resubmissionOf ? m["interchange.review.creates_material"] : m["interchange.review.creates_file"])({ people: payload.people.length, statements: payload.statements.length, exhibits: payload.exhibits.length, charges: payload.charges.length, files: p.files.length })}</p>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {!payload.resubmissionOf && (
              <>
                <label className="flex flex-col gap-1"><strong>{m["interchange.review.title"]()}</strong><Input placeholder={m["interchange.review.title_placeholder"]()} value={title} onChange={(e) => setTitle(e.target.value)} /></label>
                <label className="flex flex-col gap-1"><strong>{referenceLabel('prosecution', m["interchange.review.registration"])}</strong><Input placeholder={m["interchange.review.registration_placeholder"]()} value={registration} onChange={(e) => setRegistration(e.target.value)} /></label>
              </>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button disabled={accept.isPending || p.connectionState !== 'trusted' || (Boolean(payload.resubmissionOf) && p.resubmissionTarget?.status !== 'returned_for_investigation')} onClick={() => accept.mutate()}>
              {m["interchange.review.accept"]()}
            </Button>
          </div>
          <div className="flex flex-col gap-2 border-t pt-4">
            <strong>{m["interchange.review.or_reject"]()}</strong>
            <Textarea aria-label={m["interchange.review.reject_reason"]()} placeholder={m["interchange.review.reject_placeholder"]()} value={reason} onChange={(e) => setReason(e.target.value)} />
            <Button variant="outline" className="w-fit" disabled={reject.isPending || !reason.trim()} onClick={() => reject.mutate()}>{m["interchange.review.reject"]()}</Button>
          </div>
        </section>
      )}
      {decided && p.prosecutionFileId && <p><Link to="/files/$fileId" params={{ fileId: p.prosecutionFileId }} className="text-primary">{m["interchange.open_file"]()}</Link></p>}
    </article>
  )
}
