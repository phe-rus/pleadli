import { formatDate } from '@/lib/dates'
import { EmptyNote } from '@/components/planned'
import { PanelButton } from '@/components/add-panel'
import { AttachmentsField, entityTypes } from '@/features/attachments'
import { ChargeForm, useChargesForFile } from '@/features/charges'
import { CommentThread } from '@/features/comments'
import { ChargingReviewSection, useReviewsForFile } from '@/features/charging-review'
import { useDecisionsForFile } from '@/features/decisions'
import { useProsecutionFile } from '@/features/prosecution-files'
import { evidenceCategoryLabel, EvidenceForm, useEvidenceForFile } from '@/features/evidence'
import { ReviewNoteForm, useReviewNotesForFile } from '@/features/review-notes'
import { statementRoleLabel, StatementForm, useStatementsForFile } from '@/features/statements'
import { RichTextPreview } from '@pleadli/rich-text'
import { cn } from '@pleadli/ui/lib/utils'
import { useState } from 'react'
import { AttachedPapers, ChargesPaper, EvidencePaper, StatementPaper } from '@/features/paper/material-papers'
import { ReviewStages, reviewStages } from './review-stages'
import * as m from '@/paraglide/messages'

type Picked = { kind: 'charges' } | { kind: 'statement'; id: string } | { kind: 'evidence'; id: string }

/** What Police sent, as papers: the proposed charges, the statements and the
 * evidence, each shown as its own page with its scans under it. DPP's own
 * record of what was provided, never edited to "correct" Police's account. */
export function MaterialPanel({ fileId }: { fileId: string }) {
  const { data: charges } = useChargesForFile(fileId)
  const { data: statements } = useStatementsForFile(fileId)
  const { data: evidence } = useEvidenceForFile(fileId)
  const { data: file } = useProsecutionFile(fileId)
  const [picked, setPicked] = useState<Picked | null>(null)

  const first: Picked | null = charges.length > 0 ? { kind: 'charges' } : statements[0] ? { kind: 'statement', id: statements[0].id } : evidence[0] ? { kind: 'evidence', id: evidence[0].id } : null
  const current = picked ?? first
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
        <EmptyNote>{m["paper.binder.empty"]()}</EmptyNote>
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[14rem_1fr]">
          <nav aria-label={m["paper.binder.papers"]()} className="flex flex-col gap-3 lg:sticky lg:top-4 lg:self-start">
            {charges.length > 0 && (
              <div className="flex flex-col gap-0.5">
                <h3 className="px-2 text-xs font-medium text-muted-foreground">{m["interchange.review.charges"]()}</h3>
                {entry({ kind: 'charges' }, m["paper.charges.title"](), charges.map((c) => c.offence).join(', '))}
              </div>
            )}
            {statements.length > 0 && (
              <div className="flex flex-col gap-0.5">
                <h3 className="px-2 text-xs font-medium text-muted-foreground">{m["interchange.review.statements"]()}</h3>
                {statements.map((st) => entry({ kind: 'statement', id: st.id }, `${st.personFirstName} ${st.personLastName}`, `${statementRoleLabel(st.statementRole)} · ${formatDate(st.givenAt)}`))}
              </div>
            )}
            {evidence.length > 0 && (
              <div className="flex flex-col gap-0.5">
                <h3 className="px-2 text-xs font-medium text-muted-foreground">{m["material.evidence"]()}</h3>
                {evidence.map((ev) => entry({ kind: 'evidence', id: ev.id }, ev.identificationMark || evidenceCategoryLabel(ev.category), evidenceCategoryLabel(ev.category)))}
              </div>
            )}
          </nav>

          <div className="flex min-w-0 flex-col gap-6">
            {current.kind === 'charges' && (
              <>
                <ChargesPaper file={file} charges={charges} />
                {charges.map((c) => (
                  <CommentThread key={c.id} entityType="charge" entityId={c.id} />
                ))}
              </>
            )}
            {statement && (
              <>
                <StatementPaper file={file} statement={statement} />
                <AttachedPapers entityType={entityTypes.statement} entityId={statement.id} />
                <AttachmentsField entityType={entityTypes.statement} entityId={statement.id} label={m["material.scanned"]()} />
                <CommentThread entityType="statement" entityId={statement.id} />
              </>
            )}
            {item && (
              <>
                <EvidencePaper file={file} item={item} />
                <AttachedPapers entityType={entityTypes.evidenceItem} entityId={item.id} />
                <AttachmentsField entityType={entityTypes.evidenceItem} entityId={item.id} label={m["material.photos"]()} />
                <CommentThread entityType="evidence_item" entityId={item.id} />
              </>
            )}
          </div>
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

  return (
    <div className="flex flex-col gap-8">
      <section className="page-section">
        <h2>{m["material.review_stands"]()}</h2>
        <ReviewStages stages={reviewStages({ reviewNotes: notes.length, review: current, decision })} />
      </section>

      {file && <ChargingReviewSection fileId={fileId} status={file.currentStatus} />}

      <section className="page-section">
        <div className="section-head">
          <h2>{m["material.observations"]()}</h2>
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
    </div>
  )
}
