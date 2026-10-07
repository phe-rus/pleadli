import type { ReactNode } from 'react'
import type { Charge } from '@/features/charges/schema'
import { criteria, findings, outcomeLabels, standardLabel, testsFor, type ChargingReview, type Test } from '@/features/charging-review/schema'
import { decisionTypeLabel, type Decision } from '@/features/decisions/schema'
import { directionKindLabel, responseLabel, type Direction } from '@/features/directions/schema'
import type { DocumentRecord } from '@/features/documents/schema'
import { evidenceCategoryLabel } from '@/features/evidence'
import type { EvidenceItem } from '@/features/evidence/schema'
import type { FileItem } from '@/features/file-index/data'
import { groups, kindLabel } from '@/features/file-index/file-index'
import { fileStatusLabel, personFullNameForRole, type ProsecutionFile, type ProsecutionFilePerson } from '@/features/prosecution-files/schema'
import type { ReviewNote } from '@/features/review-notes/schema'
import { statementRoleLabel } from '@/features/statements/schema'
import type { Statement } from '@/features/statements/schema'
import { formatDate } from '@/lib/dates'
import type { Country } from '@pleadli/setup'
import * as m from '@/paraglide/messages'
import { PaperField, PaperPage, SignatureLine, type PaperEvent } from '@pleadli/paper'
import { RichTextPreview } from '@pleadli/rich-text'
import { FileRefs, hasText, type PaperLinks } from './material-papers'

const fileReference = (file: ProsecutionFile) => file.odppRegistrationNumber ?? file.policeReference

function baseDetails(file: ProsecutionFile, kind: string) {
  const reference = fileReference(file)
  return [
    ...(reference ? [{ label: m["paper.detail.reference"](), value: reference, copy: reference }] : []),
    { label: m["paper.detail.file"](), value: file.title },
    { label: m["paper.detail.kind"](), value: kind },
  ]
}

const cell = 'border border-black/40 px-2 py-1 text-left align-top'

/** The front of the file: its numbers, the people in it, what they are charged with and where it stands. */
export function FileCoverPaper({
  file,
  people,
  charges,
  decisions,
  links,
}: {
  file: ProsecutionFile
  people: ProsecutionFilePerson[]
  charges: Charge[]
  decisions: Decision[]
  links?: PaperLinks
}) {
  const named = (role: string) => people.filter((p) => p.role === role).map(personFullNameForRole)
  const accused = named('accused')
  const complainants = named('complainant')
  const offences = [...new Set(charges.map((c) => (c.statutorySection ? `${c.offence}, ${c.statutorySection}` : c.offence)))]
  const last = [...decisions].sort((a, b) => b.decidedAt - a.decidedAt)[0]
  return (
    <PaperPage
      entityType="file_cover"
      entityId={file.id}
      reference={fileReference(file)}
      title={m["paper.cover.title"]()}
      {...links}
      details={[...baseDetails(file, m["paper.cover.title"]()), { label: m["paper.detail.status"](), value: fileStatusLabel(file.currentStatus) }]}
    >
      <header className="mb-8 flex flex-col items-center gap-1 text-center">
        <p className="font-semibold uppercase">{file.title}</p>
      </header>
      <section className="mb-6 flex flex-col gap-0.5">
        <PaperField label={m["paper.refs.office"]()}>{file.odppRegistrationNumber ?? m["paper.cover.not_given"]()}</PaperField>
        <PaperField label={m["paper.refs.police"]()}>{file.policeReference ?? m["paper.cover.not_given"]()}</PaperField>
        <PaperField label={m["paper.refs.station"]()}>{file.policeStation ?? m["paper.cover.not_given"]()}</PaperField>
        <PaperField label={m["paper.refs.court"]()}>{file.courtCaseNumber ?? m["paper.cover.not_given"]()}</PaperField>
        <PaperField label={m["paper.cover.received"]()}>{formatDate(file.receivedAt, 'long')}</PaperField>
      </section>
      <section className="mb-6 flex flex-col gap-0.5">
        <PaperField label={m["paper.cover.accused"]()}>{accused.length ? accused.join('; ') : m["paper.cover.not_given"]()}</PaperField>
        {complainants.length > 0 && <PaperField label={m["paper.cover.complainant"]()}>{complainants.join('; ')}</PaperField>}
        <PaperField label={m["paper.cover.offences"]()}>{offences.length ? offences.join('; ') : m["paper.cover.not_given"]()}</PaperField>
      </section>
      <section className="flex flex-col gap-0.5">
        <PaperField label={m["paper.detail.status"]()}>{fileStatusLabel(file.currentStatus)}</PaperField>
        {last && <PaperField label={m["paper.cover.last_decision"]()}>{`${decisionTypeLabel(last.decisionType)}, ${formatDate(last.decidedAt, 'long')}`}</PaperField>}
      </section>
    </PaperPage>
  )
}

/** Every paper in the file, numbered in the order the binder holds them, as the index sheet at the front of a file. */
export function FileIndexPaper({
  file,
  country,
  documents,
  items,
  charges,
  statements,
  evidence,
}: {
  file: ProsecutionFile
  country: Country | undefined
  documents: DocumentRecord[]
  items: FileItem[]
  charges: Charge[]
  statements: Statement[]
  evidence: EvidenceItem[]
}) {
  type Row = { title: string; kind: string; date: number | null; pages?: string | null }
  const pages = (i: FileItem) => (i.pageFrom ? (i.pageTo && i.pageTo !== i.pageFrom ? `${i.pageFrom}–${i.pageTo}` : String(i.pageFrom)) : null)
  const sections: { title: string; code?: string | null; rows: Row[] }[] = [
    { title: m["paper.binder.prepared"](), rows: documents.map((d) => ({ title: d.reference ? `${d.title} (${d.reference})` : d.title, kind: d.reference ? m["paper.index.issued"]() : m["doc.draft"](), date: d.issuedAt ?? d.preparedAt })) },
    ...groups(country, items).map((g) => ({ title: g.title, code: g.code, rows: g.items.map((i) => ({ title: i.title, kind: kindLabel(i.kind), date: i.documentDate, pages: pages(i) })) })),
    {
      title: m["paper.binder.from_police"](),
      rows: [
        ...(charges.length ? [{ title: m["paper.charges.title"](), kind: m["paper.detail.counts"]() + `: ${charges.length}`, date: null }] : []),
        ...statements.map((s) => ({ title: [s.personFirstName, s.personOtherNames, s.personLastName].filter(Boolean).join(' '), kind: statementRoleLabel(s.statementRole), date: s.givenAt })),
        ...evidence.map((e) => ({ title: e.identificationMark || evidenceCategoryLabel(e.category), kind: evidenceCategoryLabel(e.category), date: null })),
      ],
    },
  ].filter((s) => s.rows.length > 0)
  let n = 0
  return (
    <PaperPage
      entityType="file_index"
      entityId={file.id}
      reference={fileReference(file)}
      title={m["paper.index.title"]()}
      head={<FileRefs file={file} />}
      details={[...baseDetails(file, m["paper.index.title"]()), { label: m["paper.index.entries"](), value: String(sections.reduce((t, s) => t + s.rows.length, 0)) }]}
    >
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr>
            <th className={`${cell} w-10`}>{m["paper.index.no"]()}</th>
            <th className={cell}>{m["paper.index.paper"]()}</th>
            <th className={cell}>{m["paper.detail.kind"]()}</th>
            <th className={`${cell} w-28`}>{m["paper.detail.date"]()}</th>
            <th className={`${cell} w-16`}>{m["paper.index.pages"]()}</th>
          </tr>
        </thead>
        <tbody>
          {sections.map((s) => (
            <SectionRows key={`${s.code ?? ''}${s.title}`} title={s.code ? `${s.code}. ${s.title}` : s.title}>
              {s.rows.map((r) => {
                n += 1
                return (
                  <tr key={n}>
                    <td className={`${cell} tabular-nums`}>{n}</td>
                    <td className={cell}>{r.title}</td>
                    <td className={cell}>{r.kind}</td>
                    <td className={`${cell} tabular-nums`}>{r.date ? formatDate(r.date) : ''}</td>
                    <td className={`${cell} tabular-nums`}>{r.pages ?? ''}</td>
                  </tr>
                )
              })}
            </SectionRows>
          ))}
        </tbody>
      </table>
    </PaperPage>
  )
}

function SectionRows({ title, children }: { title: string; children: ReactNode }) {
  return (
    <>
      <tr>
        <td colSpan={5} className={`${cell} font-semibold uppercase`}>
          {title}
        </td>
      </tr>
      {children}
    </>
  )
}

/** The prosecutor's observations on the file, in the order they were written, as minutes on a minute sheet. */
export function MinuteSheetPaper({ file, notes }: { file: ProsecutionFile; notes: ReviewNote[] }) {
  // An observation saved with no wording says nothing on paper, so it is left off the sheet.
  const ordered = notes.filter((n) => hasText(n.note)).sort((a, b) => a.createdAt - b.createdAt)
  return (
    <PaperPage
      entityType="minute_sheet"
      entityId={file.id}
      reference={fileReference(file)}
      title={m["paper.minutes.title"]()}
      head={<FileRefs file={file} />}
      details={[...baseDetails(file, m["paper.minutes.title"]()), { label: m["paper.minutes.count"](), value: String(ordered.length) }]}
      events={ordered.map((n) => ({ at: n.createdAt, label: m["paper.minutes.written"](), by: n.author }))}
    >
      {ordered.map((note, i) => (
        <section key={note.id} className="mb-8">
          <p className="mb-1 text-xs font-semibold uppercase">
            {m["paper.minutes.minute"]({ n: String(i + 1) })} · {formatDate(note.createdAt, 'datetime')}
          </p>
          <RichTextPreview className="[&_p]:mb-3" value={note.note} />
          <div className="mt-4">
            <SignatureLine name={note.author ?? undefined} caption={m["paper.minutes.by"]()} />
          </div>
        </section>
      ))}
    </PaperPage>
  )
}

function findingLabel(id: string) {
  return findings.find((f) => f.id === id)?.label ?? id
}

/** The tests of the charging guidelines as they were applied, criterion by criterion. */
function ReviewTests({ review }: { review: ChargingReview }) {
  const outcome = (test: Test) => (test === 'evidential' ? review.evidentialOutcome : test === 'public_interest' ? review.publicInterestOutcome : review.thresholdOutcome)
  return (
    <>
      {testsFor(review.standard).map((test) => {
        const result = outcome(test)
        return (
          <section key={test} className="mb-6">
            <h2 className="mb-2 text-xs font-semibold uppercase underline">{criteria[test].label}</h2>
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr>
                  <th className={cell}>{m["paper.review.criterion"]()}</th>
                  <th className={`${cell} w-32`}>{m["paper.review.finding"]()}</th>
                  <th className={cell}>{m["paper.review.note"]()}</th>
                </tr>
              </thead>
              <tbody>
                {criteria[test].items.map((c) => {
                  const a = review.assessments.find((x) => x.test === test && x.criterion === c.id)
                  return (
                    <tr key={c.id}>
                      <td className={cell}>{c.label}</td>
                      <td className={cell}>{a ? findingLabel(a.finding) : m["paper.review.not_assessed"]()}</td>
                      <td className={cell}>{a?.note ?? ''}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            <p className="mt-2">
              <strong>{m["paper.review.outcome"]()}:</strong> {result ? (outcomeLabels[result] ?? result) : m["paper.review.no_outcome"]()}
            </p>
          </section>
        )
      })}
    </>
  )
}

/** A charging review as a paper: the standard applied, each criterion's finding and the outcome of each test. */
export function ReviewPaper({ file, review, links }: { file: ProsecutionFile; review: ChargingReview; links?: PaperLinks }) {
  const events: PaperEvent[] = [
    { at: review.startedAt, label: m["paper.review.started"](), by: review.startedBy },
    ...(review.concludedAt ? [{ at: review.concludedAt, label: m["paper.review.concluded"]() }] : []),
  ]
  return (
    <PaperPage
      entityType="charging_review"
      entityId={review.id}
      reference={fileReference(file)}
      title={m["paper.review.title"]()}
      head={<FileRefs file={file} />}
      {...links}
      events={events}
      details={[
        ...baseDetails(file, m["paper.review.title"]()),
        { label: m["paper.review.standard"](), value: standardLabel(review.standard) },
        { label: m["paper.detail.date"](), value: formatDate(review.startedAt, 'long') },
        { label: m["paper.detail.status"](), value: review.concludedAt ? m["paper.review.concluded"]() : m["paper.review.open"]() },
      ]}
    >
      <section className="mb-6 flex flex-col gap-0.5">
        <PaperField label={m["paper.review.standard"]()}>{standardLabel(review.standard)}</PaperField>
        <PaperField label={m["paper.review.started"]()}>{formatDate(review.startedAt, 'long')}</PaperField>
        {review.concludedAt && <PaperField label={m["paper.review.concluded"]()}>{formatDate(review.concludedAt, 'long')}</PaperField>}
        {review.reopenReason && <PaperField label={m["paper.review.reopened"]()}>{review.reopenReason}</PaperField>}
      </section>
      <ReviewTests review={review} />
      <section className="mt-12">
        <SignatureLine name={review.startedBy ?? undefined} caption={m["paper.review.by"]()} />
      </section>
    </PaperPage>
  )
}

/**
 * One decision as the office records it: what was decided, on which counts,
 * by whom and why, the test it rested on and, for a return, the numbered
 * directions with what Police answered.
 */
export function DecisionPaper({
  file,
  act,
  charges,
  directions,
  review,
  people,
  links,
}: {
  file: ProsecutionFile
  /** The rows recorded together as one act, one per count. */
  act: Decision[]
  charges: Charge[]
  directions: Direction[]
  review: ChargingReview | null
  people: ProsecutionFilePerson[]
  links?: PaperLinks
}) {
  const first = act[0]!
  const counts = act.map((d) => (d.chargeId ? (charges.find((c) => c.id === d.chargeId)?.offence ?? m["file_ws.a_count"]()) : m["file_ws.whole_file"]()))
  const personName = (id: string | null) => {
    const p = id ? people.find((x) => x.personId === id) : null
    return p ? personFullNameForRole(p) : null
  }
  const reasons = act.find((d) => hasText(d.reasons))?.reasons ?? null
  return (
    <PaperPage
      entityType="decision"
      entityId={first.id}
      reference={fileReference(file)}
      title={m["paper.decision.title"]()}
      head={<FileRefs file={file} />}
      {...links}
      events={[{ at: first.decidedAt, label: m["paper.decision.recorded"](), by: first.decidedBy }]}
      details={[
        ...baseDetails(file, decisionTypeLabel(first.decisionType)),
        { label: m["paper.decision.decided_by"](), value: first.decidedBy ?? m["paper.cover.not_given"]() },
        { label: m["paper.detail.date"](), value: formatDate(first.decidedAt, 'long') },
      ]}
    >
      <section className="mb-6 flex flex-col gap-0.5">
        <PaperField label={m["paper.decision.decision"]()}>{decisionTypeLabel(first.decisionType)}</PaperField>
        <PaperField label={m["paper.decision.applies_to"]()}>{counts.join('; ')}</PaperField>
        <PaperField label={m["paper.decision.decided_by"]()}>{first.decidedBy ?? m["paper.cover.not_given"]()}</PaperField>
        <PaperField label={m["paper.decision.decided_on"]()}>{formatDate(first.decidedAt, 'datetime')}</PaperField>
        {review && <PaperField label={m["paper.decision.on_review"]()}>{`${standardLabel(review.standard)}, ${formatDate(review.startedAt, 'long')}`}</PaperField>}
      </section>

      <h2 className="mb-1 text-xs font-semibold uppercase underline">{m["paper.decision.reasons"]()}</h2>
      {reasons ? <RichTextPreview className="mb-6 [&_p]:mb-3" value={reasons} /> : <p className="mb-6 italic">{m["paper.decision.no_reasons"]()}</p>}

      {directions.length > 0 && (
        <section className="mb-6">
          <h2 className="mb-2 text-xs font-semibold uppercase underline">{m["paper.decision.directions"]()}</h2>
          <ol className="flex list-decimal flex-col gap-3 ps-6">
            {[...directions]
              .sort((a, b) => a.sortOrder - b.sortOrder)
              .map((d) => (
                <li key={d.id}>
                  <p className="text-xs uppercase">
                    {directionKindLabel(d.kind)}
                    {personName(d.personId) ? ` · ${personName(d.personId)}` : ''}
                  </p>
                  <p className="whitespace-pre-wrap">{d.instruction}</p>
                  <p className="text-xs">
                    {m["paper.decision.police_answer"]()}: {responseLabel(d.response)}
                    {d.respondedAt ? `, ${formatDate(d.respondedAt)}` : ''}
                    {d.responseNote ? `. ${d.responseNote}` : ''}
                  </p>
                </li>
              ))}
          </ol>
        </section>
      )}

      {review && (
        <section className="mb-6">
          <h2 className="mb-2 text-xs font-semibold uppercase underline">{m["paper.review.title"]()}</h2>
          <ReviewTests review={review} />
        </section>
      )}

      <section className="mt-12">
        <SignatureLine name={first.decidedBy ?? undefined} caption={m["paper.decision.decided_by"]()} />
      </section>
    </PaperPage>
  )
}
