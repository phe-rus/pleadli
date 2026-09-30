import { formatDate } from '@/lib/dates'
import { Tag } from '@/components/status-tag'
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
import { ReviewStages, reviewStages } from './review-stages'
import * as m from '@/paraglide/messages'

/** What Police sent: the proposed charges, the statements and the evidence.
 * DPP's own record of what was provided, never edited to "correct" Police's
 * account. */
export function MaterialPanel({ fileId }: { fileId: string }) {
  const { data: charges } = useChargesForFile(fileId)
  const { data: statements } = useStatementsForFile(fileId)
  const { data: evidence } = useEvidenceForFile(fileId)

  return (
    <div className="flex flex-col gap-8">
      <section className="page-section">
        <div className="section-head">
          <h2>{m["interchange.review.charges"]()}</h2>
          <PanelButton label={m["material.add_charge"]()} title={m["material.add_charge"]()} description={m["material.add_charge_description"]()}>
            {({ close, setDirty }) => <ChargeForm prosecutionFileId={fileId} onSuccess={close} onDirtyChange={setDirty} />}
          </PanelButton>
        </div>
        {charges.length === 0 ? (
          <EmptyNote>{m["material.no_charges"]()}</EmptyNote>
        ) : (
          <div role="list" className="flex flex-col divide-y divide-border/60 border-y border-border/60">
            {charges.map((charge) => (
              <div key={charge.id} role="listitem" className="flex flex-col gap-1 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <strong>{charge.offence}</strong>
                  {charge.statutorySection && <Tag tone="neutral">{charge.statutorySection}</Tag>}
                </div>
                <RichTextPreview value={charge.particulars} />
                <CommentThread entityType="charge" entityId={charge.id} />
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="page-section">
        <div className="section-head">
          <h2>{m["interchange.review.statements"]()}</h2>
          <PanelButton label={m["material.add_statement"]()} title={m["material.add_statement"]()} description={m["material.add_statement_description"]()}>
            {({ close, setDirty }) => <StatementForm prosecutionFileId={fileId} onSuccess={close} onDirtyChange={setDirty} />}
          </PanelButton>
        </div>
        {statements.length === 0 ? (
          <EmptyNote>{m["material.no_statements"]()}</EmptyNote>
        ) : (
          <div role="list" className="flex flex-col divide-y divide-border/60 border-y border-border/60">
            {statements.map((statement) => (
              <div key={statement.id} role="listitem" className="flex flex-col gap-2 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Tag tone="neutral">{statementRoleLabel(statement.statementRole)}</Tag>
                  <strong>
                    {statement.personLastName}, {statement.personFirstName}
                  </strong>
                  <span className="text-muted-foreground">{formatDate(statement.givenAt)}</span>
                </div>
                <RichTextPreview value={statement.content} />
                <AttachmentsField entityType={entityTypes.statement} entityId={statement.id} label={m["material.scanned"]()} />
                <CommentThread entityType="statement" entityId={statement.id} />
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="page-section">
        <div className="section-head">
          <h2>{m["material.evidence"]()}</h2>
          <PanelButton label={m["material.add_evidence"]()} title={m["material.add_evidence"]()} description={m["material.add_evidence_description"]()}>
            {({ close, setDirty }) => <EvidenceForm prosecutionFileId={fileId} onSuccess={close} onDirtyChange={setDirty} />}
          </PanelButton>
        </div>
        {evidence.length === 0 ? (
          <EmptyNote>{m["material.no_evidence"]()}</EmptyNote>
        ) : (
          <div role="list" className="flex flex-col divide-y divide-border/60 border-y border-border/60">
            {evidence.map((item) => (
              <div key={item.id} role="listitem" className="flex flex-col gap-2 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Tag tone="neutral">{evidenceCategoryLabel(item.category)}</Tag>
                  {item.identificationMark && <span className="text-muted-foreground">{item.identificationMark}</span>}
                </div>
                <RichTextPreview value={item.description} />
                <AttachmentsField entityType={entityTypes.evidenceItem} entityId={item.id} label={m["material.photos"]()} />
                <CommentThread entityType="evidence_item" entityId={item.id} />
              </div>
            ))}
          </div>
        )}
      </section>
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
