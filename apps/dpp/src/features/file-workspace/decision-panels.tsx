import { EmptyNote, Planned } from '@/components/planned'
import { PanelButton } from '@/components/add-panel'
import { Tag } from '@/components/status-tag'
import { CommentThread } from '@/features/comments'
import { useChargesForFile } from '@/features/charges'
import { chargingDecisionTypes } from '@/features/charging-review/schema'
import { DirectionsList, useDirectionsForFile } from '@/features/directions'
import { NotifyPoliceButton } from '@/features/interchange'
import { DecisionForm, decisionActs, decisionTypeLabel, useDecisionsForFile } from '@/features/decisions'
import { DecisionDocumentAction, DocumentLibrary, decisionDocumentKind, useDocuments } from '@/features/documents'
import { EditProsecutionFileForm, useFilePeople, useProsecutionFile } from '@/features/prosecution-files'
import { ResubmissionForm, useReferralsForFile } from '@/features/referrals'
import { describeEvent, useChronology } from '@/features/workload'
import { RichTextPreview } from '@pleadli/rich-text'
import { format } from 'date-fns/format'

/** What has happened on this file, in order, read straight from the records
 * that hold it. There is no separate log to disagree with them. */
export function ChronologyPanel({ fileId }: { fileId: string }) {
  const { data: events } = useChronology(fileId)

  if (events.length === 0) return <EmptyNote>Nothing has been recorded on this file.</EmptyNote>

  return (
    <ol className="flex flex-col">
      {events.map((event, index) => {
        const { title, detail } = describeEvent(event)
        return (
          <li key={`${event.kind}:${event.id}`} className="grid grid-cols-[7rem_1rem_1fr] gap-x-3 sm:grid-cols-[9rem_1rem_1fr]">
            <time dateTime={new Date(event.at).toISOString()} className="pt-0.5 text-right text-muted-foreground tabular-nums">
              {format(event.at, 'd MMM yyyy')}
              <br />
              <span className="text-xs">{format(event.at, 'p')}</span>
            </time>
            <span aria-hidden className="relative flex justify-center">
              <span className="mt-2 size-2 rounded-full bg-primary" />
              {index < events.length - 1 && <span className="absolute top-4 bottom-0 w-px bg-border" />}
            </span>
            <div className="flex flex-col pb-5">
              <strong>{title}</strong>
              {detail && <p>{detail}</p>}
            </div>
          </li>
        )
      })}
    </ol>
  )
}

/** The append-only decision record. A correction is a new decision that points
 * at the one it corrects; the earlier one stays, marked as corrected. */
export function DecisionsPanel({ fileId }: { fileId: string }) {
  const { data: decisions } = useDecisionsForFile(fileId)
  const { data: charges } = useChargesForFile(fileId)
  const { data: documents } = useDocuments(fileId)
  const { data: file } = useProsecutionFile(fileId)
  const countOf = (chargeId: string | null) => (chargeId ? (charges.find((c) => c.id === chargeId)?.offence ?? 'A count') : 'Whole file')

  return (
    <div className="flex flex-col gap-8">
      <section className="page-section">
        <div className="section-head">
          <h2>Decisions</h2>
          <PanelButton label="Record a decision" title="Record a decision" description="Sanction, decline, divert, threshold charge and return follow a charging review. The others are recorded here." variant="default">
            {({ close, setDirty }) => <DecisionForm prosecutionFileId={fileId} onSuccess={close} onDirtyChange={setDirty} />}
          </PanelButton>
        </div>
        <p>Decisions are never edited or removed. A correction is a new decision that says why. The file's status follows its counts.</p>
        {decisions.length === 0 ? (
          <EmptyNote>No decisions recorded yet.</EmptyNote>
        ) : (
          <div role="list" className="flex flex-col divide-y divide-border/60 border-y border-border/60">
            {decisions.map((decision) => {
              const correctedBy = decisions.find((d) => d.correctsDecisionId === decision.id)
              const corrects = decisions.find((d) => d.id === decision.correctsDecisionId)
              return (
                <div key={decision.id} role="listitem" className="flex flex-col gap-2 py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Tag tone={correctedBy ? 'stopped' : 'done'}>{decisionTypeLabel(decision.decisionType)}</Tag>
                    <Tag tone="neutral">{countOf(decision.chargeId)}</Tag>
                    {correctedBy && <Tag tone="open">Corrected {format(correctedBy.decidedAt, 'PP')}</Tag>}
                    {corrects && <Tag tone="planned">Corrects {decisionTypeLabel(corrects.decisionType)} of {format(corrects.decidedAt, 'PP')}</Tag>}
                    <span className="text-muted-foreground">
                      {format(decision.decidedAt, 'PPp')}
                      {decision.decidedBy ? `, ${decision.decidedBy}` : ''}
                    </span>
                    {decisionDocumentKind(decision.decisionType) && (
                      <span className="ml-auto">
                        <DecisionDocumentAction
                          actDecisionIds={(decisionActs(decisions).find((a) => a.decisions.some((d) => d.id === decision.id))?.decisions ?? [decision]).map((d) => d.id)}
                          documents={documents}
                          kind={decisionDocumentKind(decision.decisionType)!}
                        />
                      </span>
                    )}
                    {file?.policeConnectionId && (
                      <NotifyPoliceButton decisionId={decision.id} />
                    )}
                    {!correctedBy && !chargingDecisionTypes.includes(decision.decisionType) && (
                      <PanelButton label="Correct" title="Correct this decision" description="Record a decision that replaces this one. The earlier one stays on the record." variant="ghost" icon={false}>
                        {({ close, setDirty }) => <DecisionForm prosecutionFileId={fileId} corrects={decision} onSuccess={close} onDirtyChange={setDirty} />}
                      </PanelButton>
                    )}
                  </div>
                  <RichTextPreview value={decision.reasons} />
                  <CommentThread entityType="decision" entityId={decision.id} />
                </div>
              )
            })}
          </div>
        )}
      </section>

      <ReturnsSection fileId={fileId} />
    </div>
  )
}

/** The court side of the file, as DPP holds it: a reference copy. Courts is the
 * authority and is not connected. */
export function CourtPanel({ fileId }: { fileId: string }) {
  const { data: file } = useProsecutionFile(fileId)
  if (!file) return null

  return (
    <div className="flex flex-col gap-6">
      <section className="page-section">
        <div className="section-head">
          <h2>Court reference</h2>
          <PanelButton label="Edit details" title="Edit file details" description="Update registration, reference and court numbers." icon={false}>
            {({ close, setDirty }) => <EditProsecutionFileForm file={file} onSuccess={close} onDirtyChange={setDirty} />}
          </PanelButton>
        </div>
        {file.courtCaseNumber ? (
          <p>
            Court case number <strong>{file.courtCaseNumber}</strong>. Recorded by the prosecutor; the court's own record is the authority.
          </p>
        ) : (
          <EmptyNote>No court case number recorded. It is assigned once the charge sheet is filed.</EmptyNote>
        )}
      </section>
      <Planned title="Trial dates and adjournments" covers={['Hearing dates and what each hearing was for.', 'Adjournments, and the three consecutive adjournments review trigger.', 'Notices to the prosecutor.']}>
        Court matters stay DPP-owned until a Courts application exists to connect to.
      </Planned>
    </div>
  )
}

/** The documents of this file: prepared drafts and issued documents, and what
 * its decisions could still produce. */
export function DocumentsPanel({ fileId }: { fileId: string }) {
  return <DocumentLibrary fileId={fileId} />
}

/** The loop with Police: each return, the directions it carried, when the file
 * came back, and whether each direction was met. */
function ReturnsSection({ fileId }: { fileId: string }) {
  const { data: decisions } = useDecisionsForFile(fileId)
  const { data: referrals } = useReferralsForFile(fileId)
  const { data: directions } = useDirectionsForFile(fileId)
  const { data: people } = useFilePeople(fileId)
  const { data: file } = useProsecutionFile(fileId)
  const { data: documents } = useDocuments(fileId)
  const personNames = Object.fromEntries(people.map((p) => [p.personId, `${p.personLastName}, ${p.personFirstName}`]))
  const resubmissions = referrals.filter((r) => r.isResubmission)
  // Returns recorded before directions existed have none to show.
  const allReturns = decisions.filter((d) => d.decisionType === 'return_for_investigation')

  return (
    <section className="page-section">
      <div className="section-head">
        <h2>Return and resubmission</h2>
        {file?.currentStatus === 'returned_for_investigation' && (
          <PanelButton label="Log a resubmission" title="Log a resubmission" description="Record the file coming back from Police." variant="default">
            {({ close, setDirty }) => <ResubmissionForm prosecutionFileId={fileId} onSuccess={close} onDirtyChange={setDirty} />}
          </PanelButton>
        )}
      </div>
      {allReturns.length === 0 ? (
        <EmptyNote>This file has not been returned to Police.</EmptyNote>
      ) : (
        allReturns.map((ret) => {
          const items = directions.filter((d) => d.decisionId === ret.id)
          const answered = resubmissions.find((r) => r.answersDecisionId === ret.id) ?? resubmissions.find((r) => r.receivedAt >= ret.decidedAt)
          return (
            <div key={ret.id} className="flex flex-col gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <strong>Returned {format(ret.decidedAt, 'PP')}</strong>
                {answered ? <Tag tone="done">Resubmitted {format(answered.receivedAt, 'PP')}</Tag> : <Tag tone="waiting">With Police</Tag>}
                {items.length > 0 && (
                  <span className="ml-auto">
                    <DecisionDocumentAction actDecisionIds={[ret.id]} documents={documents} kind="directions_to_police" />
                  </span>
                )}
              </div>
              {items.length === 0 ? (
                <p>No directions were recorded with this return.</p>
              ) : (
                <DirectionsList directions={items} canRecord={Boolean(answered)} personNames={personNames} />
              )}
              {answered?.materialSummary && (
                <div className="flex flex-col gap-1">
                  <h3>What came back</h3>
                  <RichTextPreview value={answered.materialSummary} />
                </div>
              )}
            </div>
          )
        })
      )}
    </section>
  )
}
