import { formatDate } from '@/lib/dates'
import { EmptyNote } from '@/components/planned'
import { PanelButton } from '@/components/add-panel'
import { AttachmentsField, entityTypes, type EntityType } from '@/features/attachments'
import { ChargeForm, useChargesForFile } from '@/features/charges'
import { CommentThread } from '@/features/comments'
import { ChargingReviewSection, useReviewsForFile } from '@/features/charging-review'
import { useDecisionsForFile } from '@/features/decisions'
import { filePersonRoles, useFilePeople, useProsecutionFile } from '@/features/prosecution-files'
import { evidenceCategoryLabel, EvidenceForm, useEvidenceForFile } from '@/features/evidence'
import { ReviewNoteForm, useReviewNotesForFile } from '@/features/review-notes'
import { statementRoleLabel, StatementForm, useStatementsForFile } from '@/features/statements'
import { RichTextPreview } from '@pleadli/rich-text'
import { cn } from '@pleadli/ui/lib/utils'
import { DocumentView } from '@/components/document-viewer'
import { kindLabel, useFileItems } from '@/features/file-index'
import { useState, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { CountedTabs } from '@pleadli/shell'
import type { PaperExtraTab } from '@pleadli/paper'
import { attachmentsOptions } from '@/features/attachments/queries'
import { useCommentsForEntity } from '@/features/comments'
import { AttachedPapers, ChargesPaper, EvidencePaper, StatementPaper } from '@/features/paper/material-papers'
import { ReviewStages, reviewStages } from './review-stages'
import * as m from '@/paraglide/messages'

/** Gives a paper the Attachments and Comments tabs for its own row, so a paper
 * has one row of tabs (ULII's) and not two. Counts come from the records. */
export function PaperTabs({ attachType, commentType, id, paper }: { attachType: EntityType; commentType: string; id: string; paper: (extraTabs: PaperExtraTab[]) => ReactNode }) {
  const { data: attachments = [] } = useQuery(attachmentsOptions(attachType, id))
  const { data: comments = [] } = useCommentsForEntity(commentType, id)
  const extra: PaperExtraTab[] = [
    {
      id: 'attachments',
      label: m["peruse.tab_attachments"](),
      count: attachments.length,
      icon: 'attachment',
      content: (
        <div className="flex flex-col gap-6">
          <AttachedPapers entityType={attachType} entityId={id} />
          <AttachmentsField entityType={attachType} entityId={id} label={attachType === entityTypes.evidenceItem ? m["material.photos"]() : m["material.scanned"]()} />
        </div>
      ),
    },
    { id: 'comments', label: m["peruse.tab_comments"](), count: comments.length, icon: 'comment', content: <CommentThread entityType={commentType} entityId={id} /> },
  ]
  return <>{paper(extra)}</>
}

type Picked = { kind: 'charges' } | { kind: 'scan'; id: string } | { kind: 'statement'; id: string } | { kind: 'evidence'; id: string }

/** What Police sent, as papers: the proposed charges, the statements and the
 * evidence, each shown as its own page with its scans under it. DPP's own
 * record of what was provided, never edited to "correct" Police's account. */
export function MaterialPanel({ fileId, aside }: { fileId: string; aside?: ReactNode }) {
  const { data: people } = useFilePeople(fileId)
  const { data: scans = [] } = useFileItems(fileId)
  const { data: charges } = useChargesForFile(fileId)
  const { data: statements } = useStatementsForFile(fileId)
  const { data: evidence } = useEvidenceForFile(fileId)
  const { data: file } = useProsecutionFile(fileId)
  const [picked, setPicked] = useState<Picked | null>(null)
  const [find, setFind] = useState('')
  const q = find.trim().toLowerCase()
  const hit = (...parts: (string | null | undefined)[]) => !q || parts.some((x) => x?.toLowerCase().includes(q))

  const first: Picked | null = scans[0] ? { kind: 'scan', id: scans[0].id } : charges.length > 0 ? { kind: 'charges' } : statements[0] ? { kind: 'statement', id: statements[0].id } : evidence[0] ? { kind: 'evidence', id: evidence[0].id } : null
  const current = picked ?? first
  const scan = current?.kind === 'scan' ? scans.find((x) => x.id === current.id) : undefined
  const pages = (from: number | null, to: number | null) => (from == null ? null : to == null || to === from ? m["sort.pages_one"]({ from }) : m["sort.pages_range"]({ from, to }))
  const statement = current?.kind === 'statement' ? statements.find((x) => x.id === current.id) : undefined
  const item = current?.kind === 'evidence' ? evidence.find((x) => x.id === current.id) : undefined
  const isOn = (p: Picked) => !!current && current.kind === p.kind && ('id' in p ? 'id' in current && current.id === p.id : true)

  const entry = (p: Picked, label: string, sub?: string | null) => (
    <button
      key={'id' in p ? p.id : p.kind}
      type="button"
      onClick={() => setPicked(p)}
      className={cn('flex w-full cursor-pointer flex-col items-start rounded-md px-2 py-1.5 text-left', isOn(p) ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:bg-secondary/60 hover:text-foreground')}
    >
      <span className="text-sm">{label}</span>
      {sub && <span className="text-xs text-muted-foreground">{sub}</span>}
    </button>
  )

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">{m["paper.binder.received"]()}</p>
        <div className="flex flex-wrap gap-2">
          <PanelButton label={m["material.add_charge"]()} title={m["material.add_charge"]()} description={m["material.add_charge_description"]()}>
            {({ close, setDirty }) => <ChargeForm prosecutionFileId={fileId} onSuccess={close} onDirtyChange={setDirty} />}
          </PanelButton>
          <PanelButton label={m["material.add_statement"]()} title={m["material.add_statement"]()} description={m["material.add_statement_description"]()}>
            {({ close, setDirty }) => <StatementForm prosecutionFileId={fileId} onSuccess={close} onDirtyChange={setDirty} />}
          </PanelButton>
          <PanelButton label={m["material.add_evidence"]()} title={m["material.add_evidence"]()} description={m["material.add_evidence_description"]()}>
            {({ close, setDirty }) => <EvidenceForm prosecutionFileId={fileId} onSuccess={close} onDirtyChange={setDirty} />}
          </PanelButton>
        </div>
      </div>

      {!current || !file ? (
        <div className="flex flex-col gap-4">
          <EmptyNote>{m["paper.binder.empty"]()}</EmptyNote>
          {aside}
        </div>
      ) : (
        <div className={cn('grid grid-cols-1 gap-6', aside ? 'lg:grid-cols-[14rem_minmax(0,1fr)_19rem]' : 'lg:grid-cols-[14rem_1fr]')}>
          <nav aria-label={m["paper.binder.papers"]()} className="flex flex-col gap-3 lg:sticky lg:top-4 lg:self-start">
            <h3 className="px-2 text-xs font-semibold tracking-wide text-muted-foreground">{m["peruse.from_police"]({ count: scans.length + charges.length + statements.length + evidence.length })}</h3>
            <input value={find} onChange={(e) => setFind(e.target.value)} placeholder={m["peruse.find_in_file"]()} aria-label={m["peruse.find_in_file"]()} className="h-8 rounded-md border border-input bg-transparent px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/40" />
            {scans.length > 0 && (
              <div className="flex flex-col gap-0.5">
                {scans.filter((sc) => hit(sc.title, kindLabel(sc.kind))).map((sc) => entry({ kind: 'scan', id: sc.id }, sc.title, [kindLabel(sc.kind), pages(sc.pageFrom, sc.pageTo)].filter(Boolean).join(' · ')))}
              </div>
            )}
            {charges.length > 0 && (
              <div className="flex flex-col gap-0.5">
                <h3 className="px-2 text-xs font-medium text-muted-foreground">{m["interchange.review.charges"]()} <span className="ms-1 rounded-full bg-secondary px-1.5 py-0.5 text-[0.6875rem] tabular-nums">{charges.length}</span></h3>
                {entry({ kind: 'charges' }, m["paper.charges.title"](), charges.map((c) => c.offence).join(', '))}
              </div>
            )}
            {statements.length > 0 && (
              <div className="flex flex-col gap-0.5">
                <h3 className="px-2 text-xs font-medium text-muted-foreground">{m["interchange.review.statements"]()} <span className="ms-1 rounded-full bg-secondary px-1.5 py-0.5 text-[0.6875rem] tabular-nums">{statements.length}</span></h3>
                {statements.filter((st) => hit(st.personFirstName, st.personLastName, statementRoleLabel(st.statementRole))).map((st) => entry({ kind: 'statement', id: st.id }, `${st.personFirstName} ${st.personLastName}`, `${statementRoleLabel(st.statementRole)} · ${formatDate(st.givenAt)}`))}
              </div>
            )}
            {evidence.length > 0 && (
              <div className="flex flex-col gap-0.5">
                <h3 className="px-2 text-xs font-medium text-muted-foreground">{m["material.evidence"]()} <span className="ms-1 rounded-full bg-secondary px-1.5 py-0.5 text-[0.6875rem] tabular-nums">{evidence.length}</span></h3>
                {evidence.filter((ev) => hit(ev.identificationMark, evidenceCategoryLabel(ev.category))).map((ev) => entry({ kind: 'evidence', id: ev.id }, ev.identificationMark || evidenceCategoryLabel(ev.category), evidenceCategoryLabel(ev.category)))}
              </div>
            )}
            {people.length > 0 && (
              <div className="flex flex-col gap-0.5">
                <h3 className="px-2 text-xs font-semibold tracking-wide text-muted-foreground">{m["peruse.people"]()} <span className="ms-1 rounded-full bg-secondary px-1.5 py-0.5 text-[0.6875rem] tabular-nums">{people.length}</span></h3>
                {people.map((p) => (
                  <div key={p.id} className="flex justify-between gap-2 px-2 py-1.5 text-sm">
                    <span>{p.personFirstName} {p.personLastName}</span>
                    <span className="text-muted-foreground">{filePersonRoles.find((r) => r.value === p.role)?.label ?? p.role}</span>
                  </div>
                ))}
              </div>
            )}
            <p className="px-2 text-xs leading-snug text-muted-foreground">{m["peruse.kept_note"]()}</p>
          </nav>

          <div className="flex min-w-0 flex-col gap-6">
            {scan && (
              <>
                <div className="flex justify-between gap-2 text-sm text-muted-foreground">
                  <span className="font-semibold text-foreground">{scan.title}</span>
                  <span>{pages(scan.pageFrom, scan.pageTo)}</span>
                </div>
                {scan.attachmentId ? (
                  <DocumentView key={scan.id} attachmentId={scan.attachmentId} page={scan.pageFrom} title={scan.title} className="h-[70dvh]" />
                ) : (
                  <p className="whitespace-pre-wrap rounded-xl bg-card p-6 text-sm leading-relaxed ring-1 ring-border/60">{scan.body ?? scan.summary ?? ''}</p>
                )}
              </>
            )}
            {current.kind === 'charges' && (
              <>
                <ChargesPaper file={file} charges={charges} />
                {charges.map((c) => (
                  <CommentThread key={c.id} entityType="charge" entityId={c.id} />
                ))}
              </>
            )}
            {statement && <PaperTabs attachType={entityTypes.statement} commentType="statement" id={statement.id} paper={(extraTabs) => <StatementPaper file={file} statement={statement} extraTabs={extraTabs} />} />}
            {item && <PaperTabs attachType={entityTypes.evidenceItem} commentType="evidence_item" id={item.id} paper={(extraTabs) => <EvidencePaper file={file} item={item} extraTabs={extraTabs} />} />}
          </div>
          {aside}
        </div>
      )}
    </div>
  )
}

/** The prosecutor's own review trail. Reviewing never changes the file's
 * status: only a recorded decision does. */
export function ReviewPanel({ fileId }: { fileId: string }) {
  const { data: notes } = useReviewNotesForFile(fileId)
  const { data: decisions } = useDecisionsForFile(fileId)
  const { data: reviews } = useReviewsForFile(fileId)
  const { data: file } = useProsecutionFile(fileId)
  const current = reviews[0] ?? null
  const decision = current ? (decisions.find((d) => d.reviewId === current.id) ?? null) : null

  const standsTab = (
      <section className="page-section">
        <ReviewStages stages={reviewStages({ reviewNotes: notes.length, review: current, decision })} />
      </section>
  )
  const notesTab = (
      <section className="page-section">
        <div className="section-head">
            <PanelButton label={m["material.add_observation"]()} title={m["material.add_observation"]()} description={m["material.add_observation_description"]()}>
            {({ close, setDirty }) => <ReviewNoteForm prosecutionFileId={fileId} onSuccess={close} onDirtyChange={setDirty} />}
          </PanelButton>
        </div>
        {notes.length === 0 ? (
          <EmptyNote>{m["material.no_observations"]()}</EmptyNote>
        ) : (
          <div role="list" className="flex flex-col divide-y divide-border/60 border-y border-border/60">
            {notes.map((note) => (
              <div key={note.id} role="listitem" className="flex flex-col gap-2 py-3">
                <p className="text-muted-foreground">
                  {formatDate(note.createdAt, 'datetime')}
                  {note.author ? `, ${note.author}` : ''}
                </p>
                <RichTextPreview value={note.note} />
                <CommentThread entityType="review_note" entityId={note.id} />
              </div>
            ))}
          </div>
        )}
      </section>
  )
  return (
    <CountedTabs
      tabs={[
        { id: 'stands', label: m["peruse.tab_stands"](), content: standsTab },
        ...(file ? [{ id: 'tests', label: m["peruse.tab_tests"](), content: <ChargingReviewSection fileId={fileId} status={file.currentStatus} /> }] : []),
        { id: 'notes', label: m["peruse.tab_notes"](), count: notes.length, content: notesTab },
      ]}
    />
  )
}
