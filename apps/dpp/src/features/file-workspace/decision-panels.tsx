import { formatDate } from '@/lib/dates'
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
import { Group, GroupRow } from '@pleadli/ui/grouped'
import * as m from '@/paraglide/messages'
import { NewDocumentButton } from '@/features/templates/new-document'

/** What has happened on this file, in order, read straight from the records
 * that hold it. There is no separate log to disagree with them. */
export function ChronologyPanel({ fileId }: { fileId: string }) {
  const { data: events } = useChronology(fileId)

  if (events.length === 0) return <EmptyNote>{m["file_ws.chronology_empty"]()}</EmptyNote>

  // Grouped by day, newest first, as a Mac lists history: the day as a quiet
  // title, then what happened that day with its time.
  const days = new Map<string, typeof events>()
  for (const event of [...events].sort((a, b) => b.at - a.at)) {
    const day = formatDate(event.at, 'long')
    days.set(day, [...(days.get(day) ?? []), event])
  }

  return (
    <div className="flex flex-col gap-6">
      {[...days.entries()].map(([day, list]) => (
        <Group key={day} title={day}>
          {list.map((event) => {
            const { title, detail } = describeEvent(event)
            return <GroupRow key={`${event.kind}:${event.id}`} label={title} detail={detail ?? undefined} value={<time className="text-xs tabular-nums">{formatDate(event.at, 'time')}</time>} />
          })}
        </Group>
      ))}
    </div>
  )
}

/** The append-only decision record. A correction is a new decision that points
 * at the one it corrects; the earlier one stays, marked as corrected. */
export function DecisionsPanel({ fileId }: { fileId: string }) {
  const { data: decisions } = useDecisionsForFile(fileId)
  const { data: charges } = useChargesForFile(fileId)
  const { data: documents } = useDocuments(fileId)
  const { data: file } = useProsecutionFile(fileId)
  const countOf = (chargeId: string | null) => (chargeId ? (charges.find((c) => c.id === chargeId)?.offence ?? m["file_ws.a_count"]()) : m["file_ws.whole_file"]())

  return (
    <div className="flex flex-col gap-8">
      <section className="page-section">
        <div className="section-head">
          <h2>{m["nav.item.decisions"]()}</h2>
          <PanelButton label={m["file_ws.record_decision"]()} title={m["file_ws.record_decision"]()} description={m["file_ws.record_decision_description"]()} variant="default">
            {({ close, setDirty }) => <DecisionForm prosecutionFileId={fileId} onSuccess={close} onDirtyChange={setDirty} />}
          </PanelButton>
        </div>
        <p>{m["file_ws.decisions_hint"]()}</p>
        {decisions.length === 0 ? (
          <EmptyNote>{m["file_ws.no_decisions"]()}</EmptyNote>
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
                    {correctedBy && <Tag tone="open">{m["file_ws.corrected"]({ date: formatDate(correctedBy.decidedAt) })}</Tag>}
                    {corrects && <Tag tone="planned">{m["file_ws.corrects"]({ decision: decisionTypeLabel(corrects.decisionType), date: formatDate(corrects.decidedAt) })}</Tag>}
                    <span className="text-muted-foreground">
                      {formatDate(decision.decidedAt, 'datetime')}
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
                      <PanelButton label={m["file_ws.correct"]()} title={m["file_ws.correct_title"]()} description={m["file_ws.correct_description"]()} variant="ghost" icon={false}>
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
          <h2>{m["file_ws.court_reference"]()}</h2>
          <PanelButton label={m["file_ws.edit"]()} title={m["file_ws.edit_title"]()} description={m["file_ws.edit_description"]()} icon={false}>
            {({ close, setDirty }) => <EditProsecutionFileForm file={file} onSuccess={close} onDirtyChange={setDirty} />}
          </PanelButton>
        </div>
        {file.courtCaseNumber ? (
          <p>
            {m["file_ws.court_number_label"]()} <strong>{file.courtCaseNumber}</strong>. {m["file_ws.court_number_hint"]()}
          </p>
        ) : (
          <EmptyNote>{m["file_ws.no_court_number"]()}</EmptyNote>
        )}
      </section>
      <Planned title={m["file_ws.planned_title"]()} covers={[m["file_ws.planned_hearings"](), m["file_ws.planned_adjournments"](), m["file_ws.planned_notices"]()]}>
        {m["file_ws.planned_body"]()}
      </Planned>
    </div>
  )
}

/** The documents of this file: prepared drafts and issued documents, and what
 * its decisions could still produce. */
export function DocumentsPanel({ fileId }: { fileId: string }) {
  const { data: decisions } = useDecisionsForFile(fileId)
  const latest = [...decisions].sort((a, b) => b.decidedAt - a.decidedAt)[0]
  return (
    <div className="flex flex-col gap-3">
      <div className="flex justify-end">
        <NewDocumentButton fileId={fileId} decisionId={latest?.id ?? null} decisionKind={latest?.decisionType ?? null} />
      </div>
      <DocumentLibrary fileId={fileId} />
    </div>
  )
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
        <h2>{m["file_ws.returns"]()}</h2>
        {file?.currentStatus === 'returned_for_investigation' && (
          <PanelButton label={m["file_ws.log_resubmission"]()} title={m["file_ws.log_resubmission"]()} description={m["file_ws.log_resubmission_description"]()} variant="default">
            {({ close, setDirty }) => <ResubmissionForm prosecutionFileId={fileId} onSuccess={close} onDirtyChange={setDirty} />}
          </PanelButton>
        )}
      </div>
      {allReturns.length === 0 ? (
        <EmptyNote>{m["file_ws.not_returned"]()}</EmptyNote>
      ) : (
        allReturns.map((ret) => {
          const items = directions.filter((d) => d.decisionId === ret.id)
          const answered = resubmissions.find((r) => r.answersDecisionId === ret.id) ?? resubmissions.find((r) => r.receivedAt >= ret.decidedAt)
          return (
            <div key={ret.id} className="flex flex-col gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <strong>{m["file_ws.returned_on"]({ date: formatDate(ret.decidedAt) })}</strong>
                {answered ? <Tag tone="done">{m["file_ws.resubmitted_on"]({ date: formatDate(answered.receivedAt) })}</Tag> : <Tag tone="waiting">{m["file_ws.with_police"]()}</Tag>}
                {items.length > 0 && (
                  <span className="ml-auto">
                    <DecisionDocumentAction actDecisionIds={[ret.id]} documents={documents} kind="directions_to_police" />
                  </span>
                )}
              </div>
              {items.length === 0 ? (
                <p>{m["file_ws.no_directions"]()}</p>
              ) : (
                <DirectionsList directions={items} canRecord={Boolean(answered)} personNames={personNames} />
              )}
              {answered?.materialSummary && (
                <div className="flex flex-col gap-1">
                  <h3>{m["file_ws.came_back"]()}</h3>
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
