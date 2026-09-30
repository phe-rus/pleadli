import { formatDate } from '@/lib/dates'
import { PanelButton } from '@/components/add-panel'
import { EmptyNote } from '@/components/planned'
import { Tag } from '@/components/status-tag'
import { DecisionForm, decisionTypeLabel, useDecisionsForFile } from '@/features/decisions'
import { ApiError } from '@/lib/api'
import { Button } from '@pleadli/ui/button'
import { t } from '@pleadli/ui/goey-toaster'
import { cn } from '@pleadli/ui/lib/utils'
import { Textarea } from '@pleadli/ui/textarea'
import { DrawerFooter } from '@pleadli/ui/drawer'
import { useState } from 'react'
import { useReviewsForFile, useSetAssessment, useSetOutcome, useStartReview } from './queries'
import {
  criteria,
  findingCounts,
  findings,
  outcomeLabels,
  permittedDecisions,
  standardLabel,
  standards,
  testsFor,
  type ChargingReview,
  type Finding,
  type Standard,
  type Test,
} from './schema'
import * as m from '@/paraglide/messages'

const say = (error: unknown) => (error instanceof ApiError ? error.message : m["common.try_again"]())

function CriterionRow({ review, test, criterionId }: { review: ChargingReview; test: Test; criterionId: string }) {
  const item = criteria[test].items.find((c) => c.id === criterionId)!
  const assessment = review.assessments.find((a) => a.criterion === criterionId)
  const [note, setNote] = useState(assessment?.note ?? '')
  const [noting, setNoting] = useState(Boolean(assessment?.note))
  const save = useSetAssessment()
  const open = review.concludedAt === null

  const record = (finding: Finding, text = note) =>
    save.mutate({ reviewId: review.id, criterion: criterionId, finding, note: text }, { onError: (e) => t.error(m["review.panel.finding_failed"](), { description: say(e) }) })

  return (
    <div className="flex flex-col gap-2 py-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex min-w-0 flex-col">
          <strong>{item.label}</strong>
          <p>{item.about}</p>
        </div>
        <div role="group" aria-label={m["review.panel.finding_on"]({ criterion: item.label })} className="flex shrink-0 gap-1">
          {findings.map((f) => (
            <Button
              key={f.id}
              size="xs"
              type="button"
              disabled={!open}
              variant={assessment?.finding === f.id ? 'default' : 'outline'}
              aria-pressed={assessment?.finding === f.id}
              onClick={() => record(f.id)}
            >
              {f.label}
            </Button>
          ))}
        </div>
      </div>
      {!noting && open && (
        <Button size="xs" type="button" variant="ghost" className="w-fit" onClick={() => setNoting(true)}>
          {m["review.panel.add_note"]()}
        </Button>
      )}
      {noting && <Textarea
        value={note}
        disabled={!open}
        onChange={(e) => setNote(e.target.value)}
        onBlur={() => {
          if (note !== (assessment?.note ?? '') && (assessment || note.trim())) record((assessment?.finding as Finding) ?? 'unresolved')
        }}
        placeholder={m["review.panel.note_placeholder"]()}
        aria-label={m["review.panel.note_on"]({ criterion: item.label })}
      />}
    </div>
  )
}

function TestSection({ review, test }: { review: ChargingReview; test: Test }) {
  const setOutcome = useSetOutcome()
  const def = criteria[test]
  const open = review.concludedAt === null
  const counts = findingCounts(review, test)
  const outcome = test === 'evidential' ? review.evidentialOutcome : test === 'public_interest' ? review.publicInterestOutcome : review.thresholdOutcome
  const [yes, no] = test === 'threshold' ? (['met', 'not_met'] as const) : (['passed', 'failed'] as const)
  const locked = test === 'public_interest' && review.evidentialOutcome !== 'passed'

  const record = (value: string | null) =>
    setOutcome.mutate({ reviewId: review.id, test, outcome: value }, { onError: (e) => t.error(m["review.panel.outcome_failed"](), { description: say(e) }) })

  return (
    <section className="page-section">
      <div className="section-head">
        <div className="flex flex-col">
          <h3>{def.label}</h3>
          <p>{locked ? m["review.panel.pi_locked"]() : def.about}</p>
        </div>
        <div className="flex items-center gap-2">
          {outcome && <Tag tone={outcome === 'passed' || outcome === 'met' ? 'done' : 'urgent'}>{m["review.panel.test_outcome"]({ test: def.label, outcome: outcomeLabels[outcome] })}</Tag>}
          <span className="text-muted-foreground tabular-nums">{m["review.panel.recorded_of"]({ recorded: counts.recorded, total: counts.total })}</span>
        </div>
      </div>

      {!locked && (
        <div className="divide-y divide-border/60 border-y border-border/60">
          {def.items.map((item) => (
            <CriterionRow key={item.id} review={review} test={test} criterionId={item.id} />
          ))}
        </div>
      )}

      {open && !locked && (
        <div className="flex flex-wrap items-center gap-2">
          <strong>{m["review.panel.your_conclusion"]()}</strong>
          <Button size="sm" type="button" variant={outcome === yes ? 'default' : 'outline'} onClick={() => record(yes)}>{outcomeLabels[yes]}</Button>
          <Button size="sm" type="button" variant={outcome === no ? 'default' : 'outline'} onClick={() => record(no)}>{outcomeLabels[no]}</Button>
          {outcome && <Button size="sm" type="button" variant="ghost" onClick={() => record(null)}>{m["review.panel.withdraw"]()}</Button>}
          {test === 'threshold' && <p>{m["review.panel.threshold_hint"]()}</p>}
        </div>
      )}
    </section>
  )
}

function OpenReview({ fileId, review }: { fileId: string; review: ChargingReview }) {
  const permitted = permittedDecisions(review)
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3 rounded-lg border bg-card p-4">
        <div className="flex min-w-0 flex-col gap-1">
          <h3>{review.reopensDecisionId ? m["review.panel.review_title_reopened"]({ standard: standardLabel(review.standard) }) : m["review.panel.review_title"]({ standard: standardLabel(review.standard) })}</h3>
          <p>{review.startedBy ? m["review.panel.started_by"]({ date: formatDate(review.startedAt, 'datetime'), name: review.startedBy }) : m["review.panel.started"]({ date: formatDate(review.startedAt, 'datetime') })}</p>
          {review.reopenReason && <p>{m["review.panel.reopened_because"]({ reason: review.reopenReason })}</p>}
          <p>
            {m["review.panel.findings_support"]({ decisions: permitted.map((p) => decisionTypeLabel(p)).join(', ') })}
          </p>
        </div>
        <PanelButton label={m["review.panel.record_decision"]()} title={m["review.panel.record_decision"]()} description={m["review.panel.record_decision_description"]()} variant="default">
          {({ close, setDirty }) => <DecisionForm prosecutionFileId={fileId} review={review} onSuccess={close} onDirtyChange={setDirty} />}
        </PanelButton>
      </div>
      {testsFor(review.standard).map((test) => (
        <TestSection key={test} review={review} test={test} />
      ))}
      <p>{m["review.panel.change_until_concluded"]()}</p>
    </div>
  )
}

function StartControls({ fileId }: { fileId: string }) {
  const start = useStartReview()
  const begin = (standard: Standard) =>
    start.mutate({ prosecutionFileId: fileId, standard }, { onError: (e) => t.error(m["review.panel.start_failed"](), { description: say(e) }) })

  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
      {standards.map((s) => (
        <div key={s.id} className="flex flex-col justify-between gap-3 rounded-lg border bg-card p-4">
          <div className="flex flex-col gap-1">
            <h3>{s.label}</h3>
            <p>{s.about}</p>
          </div>
          <Button size="sm" className="w-fit" variant={s.id === 'two_stage' ? 'default' : 'outline'} disabled={start.isPending} onClick={() => begin(s.id)}>
            {m["review.panel.start_named"]({ standard: s.label })}
          </Button>
        </div>
      ))}
    </div>
  )
}

function ReopenForm({ fileId, onSuccess }: { fileId: string; onSuccess: () => void }) {
  const { data: decisions } = useDecisionsForFile(fileId)
  const start = useStartReview()
  const [decisionId, setDecisionId] = useState(decisions[0]?.id ?? '')
  const [standard, setStandard] = useState<Standard>('two_stage')
  const [reason, setReason] = useState('')

  return (
    <form
      className="flex flex-1 flex-col gap-4 overflow-y-auto p-4"
      onSubmit={(event) => {
        event.preventDefault()
        start.mutate(
          { prosecutionFileId: fileId, standard, reopensDecisionId: decisionId, reopenReason: reason },
          { onSuccess, onError: (e) => t.error(m["review.panel.reopen_failed"](), { description: say(e) }) },
        )
      }}
    >
      <p>{m["review.panel.reopen_explainer"]()}</p>
      <label className="flex flex-col gap-1">
        <strong>{m["review.panel.decision_to_reopen"]()}</strong>
        <select className="h-8 rounded-md border border-input bg-input/20 px-2" value={decisionId} onChange={(e) => setDecisionId(e.target.value)}>
          {decisions.map((d) => (
            <option key={d.id} value={d.id}>{m["review.panel.decision_option"]({ decision: decisionTypeLabel(d.decisionType), date: formatDate(d.decidedAt) })}</option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1">
        <strong>{m["review.panel.test_to_apply"]()}</strong>
        <select className="h-8 rounded-md border border-input bg-input/20 px-2" value={standard} onChange={(e) => setStandard(e.target.value as Standard)}>
          {standards.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
        </select>
      </label>
      <label className="flex flex-col gap-1">
        <strong>{m["review.panel.why_reopened"]()}</strong>
        <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder={m["review.panel.reason_placeholder"]()} />
      </label>
      <DrawerFooter>
        <Button type="submit" disabled={start.isPending || !decisionId || !reason.trim()}>{m["review.panel.reopen_submit"]()}</Button>
      </DrawerFooter>
    </form>
  )
}

/** The charging review of a file: start one, apply the test criterion by
 * criterion, record the conclusions, and record the decision they support.
 * Reviews that have concluded stay listed below. */
export function ChargingReviewSection({ fileId, status }: { fileId: string; status: string }) {
  const { data: reviews } = useReviewsForFile(fileId)
  const { data: decisions } = useDecisionsForFile(fileId)
  const open = reviews.find((r) => r.concludedAt === null)
  const concluded = reviews.filter((r) => r.concludedAt !== null)
  const waiting = status === 'under_review' || status === 'resubmitted'

  return (
    <section className="page-section">
      <div className="section-head">
        <h2>{m["review.panel.section_title"]()}</h2>
        {!open && !waiting && decisions.length > 0 && (
          <PanelButton label={m["review.panel.reopen_decision"]()} title={m["review.panel.reopen_decision"]()} description={m["review.panel.reopen_decision_description"]()} icon={false}>
            {({ close }) => <ReopenForm fileId={fileId} onSuccess={close} />}
          </PanelButton>
        )}
      </div>

      {open ? (
        <OpenReview fileId={fileId} review={open} />
      ) : waiting ? (
        <>
          <p>{m["review.panel.choose_test"]()}</p>
          <StartControls fileId={fileId} />
        </>
      ) : status === 'returned_for_investigation' ? (
        <EmptyNote>{m["review.panel.with_police"]()}</EmptyNote>
      ) : (
        <EmptyNote>{m["review.panel.decision_made"]()}</EmptyNote>
      )}

      {concluded.length > 0 && (
        <div className="flex flex-col gap-2">
          <h3>{m["review.panel.concluded_reviews"]()}</h3>
          <div role="list" className={cn('flex flex-col divide-y divide-border/60 border-y border-border/60')}>
            {concluded.map((review) => {
              const outcome = review.standard === 'threshold' ? review.thresholdOutcome : review.evidentialOutcome
              const decided = decisions.filter((d) => d.reviewId === review.id)
              return (
                <div key={review.id} role="listitem" className="flex flex-wrap items-center justify-between gap-2 py-3">
                  <div className="flex flex-col">
                    <strong>{review.reopensDecisionId ? m["review.panel.standard_reopened"]({ standard: standardLabel(review.standard) }) : standardLabel(review.standard)}</strong>
                    <p>
                      {m["review.panel.date_range"]({ from: formatDate(review.startedAt), to: formatDate(review.concludedAt!) })}
                      {outcome ? `. ${m["review.panel.test_result"]({ test: review.standard === 'threshold' ? m["review.test.threshold.label"]() : m["review.test.evidential.label"](), outcome: outcomeLabels[outcome].toLowerCase() })}` : ''}
                      {review.publicInterestOutcome ? `. ${m["review.panel.test_result"]({ test: m["review.test.public_interest.label"](), outcome: outcomeLabels[review.publicInterestOutcome].toLowerCase() })}` : ''}.
                    </p>
                  </div>
                  {decided[0] && <Tag tone="done">{decisionTypeLabel(decided[0].decisionType)}</Tag>}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </section>
  )
}
