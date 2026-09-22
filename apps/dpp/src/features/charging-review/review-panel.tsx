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
import { format } from 'date-fns/format'
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

const say = (error: unknown) => (error instanceof ApiError ? error.message : 'Please try again.')

function CriterionRow({ review, test, criterionId }: { review: ChargingReview; test: Test; criterionId: string }) {
  const item = criteria[test].items.find((c) => c.id === criterionId)!
  const assessment = review.assessments.find((a) => a.criterion === criterionId)
  const [note, setNote] = useState(assessment?.note ?? '')
  const [noting, setNoting] = useState(Boolean(assessment?.note))
  const save = useSetAssessment()
  const open = review.concludedAt === null

  const record = (finding: Finding, text = note) =>
    save.mutate({ reviewId: review.id, criterion: criterionId, finding, note: text }, { onError: (e) => t.error('Could not record the finding', { description: say(e) }) })

  return (
    <div className="flex flex-col gap-2 py-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex min-w-0 flex-col">
          <strong>{item.label}</strong>
          <p>{item.about}</p>
        </div>
        <div role="group" aria-label={`Finding on ${item.label}`} className="flex shrink-0 gap-1">
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
          Add a note
        </Button>
      )}
      {noting && <Textarea
        value={note}
        disabled={!open}
        onChange={(e) => setNote(e.target.value)}
        onBlur={() => {
          if (note !== (assessment?.note ?? '') && (assessment || note.trim())) record((assessment?.finding as Finding) ?? 'unresolved')
        }}
        placeholder="Note on this finding (optional)"
        aria-label={`Note on ${item.label}`}
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
    setOutcome.mutate({ reviewId: review.id, test, outcome: value }, { onError: (e) => t.error('Could not record the outcome', { description: say(e) }) })

  return (
    <section className="page-section">
      <div className="section-head">
        <div className="flex flex-col">
          <h3>{def.label}</h3>
          <p>{locked ? 'Applied only once the Evidential Test is passed.' : def.about}</p>
        </div>
        <div className="flex items-center gap-2">
          {outcome && <Tag tone={outcome === 'passed' || outcome === 'met' ? 'done' : 'urgent'}>{def.label}: {outcomeLabels[outcome]}</Tag>}
          <span className="text-muted-foreground tabular-nums">{counts.recorded} of {counts.total} recorded</span>
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
          <strong>Your conclusion</strong>
          <Button size="sm" type="button" variant={outcome === yes ? 'default' : 'outline'} onClick={() => record(yes)}>{outcomeLabels[yes]}</Button>
          <Button size="sm" type="button" variant={outcome === no ? 'default' : 'outline'} onClick={() => record(no)}>{outcomeLabels[no]}</Button>
          {outcome && <Button size="sm" type="button" variant="ghost" onClick={() => record(null)}>Withdraw</Button>}
          {test === 'threshold' && <p>Met needs all five requirements marked as favouring.</p>}
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
          <h3>{standardLabel(review.standard)} review{review.reopensDecisionId ? ' (reopened)' : ''}</h3>
          <p>Started {format(review.startedAt, 'PPp')}{review.startedBy ? ` by ${review.startedBy}` : ''}.</p>
          {review.reopenReason && <p>Reopened because: {review.reopenReason}</p>}
          <p>
            What the findings support: {permitted.map((p) => decisionTypeLabel(p)).join(', ')}.
          </p>
        </div>
        <PanelButton label="Record the decision" title="Record the decision" description="The outcome of this review." variant="default">
          {({ close, setDirty }) => <DecisionForm prosecutionFileId={fileId} review={review} onSuccess={close} onDirtyChange={setDirty} />}
        </PanelButton>
      </div>
      {testsFor(review.standard).map((test) => (
        <TestSection key={test} review={review} test={test} />
      ))}
      <p>Findings and conclusions are yours to change until the decision concludes the review. To assess counts differently, conclude this review and start another.</p>
    </div>
  )
}

function StartControls({ fileId }: { fileId: string }) {
  const start = useStartReview()
  const begin = (standard: Standard) =>
    start.mutate({ prosecutionFileId: fileId, standard }, { onError: (e) => t.error('Could not start the review', { description: say(e) }) })

  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
      {standards.map((s) => (
        <div key={s.id} className="flex flex-col justify-between gap-3 rounded-lg border bg-card p-4">
          <div className="flex flex-col gap-1">
            <h3>{s.label}</h3>
            <p>{s.about}</p>
          </div>
          <Button size="sm" className="w-fit" variant={s.id === 'two_stage' ? 'default' : 'outline'} disabled={start.isPending} onClick={() => begin(s.id)}>
            Start a {s.label} review
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
          { onSuccess, onError: (e) => t.error('Could not reopen', { description: say(e) }) },
        )
      }}
    >
      <p>A concluded decision can be reconsidered when the original was wrong, new or significant evidence has come to light, or an inquest recommended prosecution. The reopening is a review of its own; the decision it produces corrects the old one, which stays on the record.</p>
      <label className="flex flex-col gap-1">
        <strong>Decision to reopen</strong>
        <select className="h-8 rounded-md border border-input bg-input/20 px-2" value={decisionId} onChange={(e) => setDecisionId(e.target.value)}>
          {decisions.map((d) => (
            <option key={d.id} value={d.id}>{decisionTypeLabel(d.decisionType)}, {format(d.decidedAt, 'PP')}</option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1">
        <strong>Test to apply</strong>
        <select className="h-8 rounded-md border border-input bg-input/20 px-2" value={standard} onChange={(e) => setStandard(e.target.value as Standard)}>
          {standards.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
        </select>
      </label>
      <label className="flex flex-col gap-1">
        <strong>Why it is being reopened</strong>
        <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="The reason, for the record" />
      </label>
      <DrawerFooter>
        <Button type="submit" disabled={start.isPending || !decisionId || !reason.trim()}>Reopen for review</Button>
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
        <h2>Charging review</h2>
        {!open && !waiting && decisions.length > 0 && (
          <PanelButton label="Reopen a decision" title="Reopen a decision" description="Bring a concluded decision back for review." icon={false}>
            {({ close }) => <ReopenForm fileId={fileId} onSuccess={close} />}
          </PanelButton>
        )}
      </div>

      {open ? (
        <OpenReview fileId={fileId} review={open} />
      ) : waiting ? (
        <>
          <p>Choose the test to apply. Nothing is recorded until you start.</p>
          <StartControls fileId={fileId} />
        </>
      ) : status === 'returned_for_investigation' ? (
        <EmptyNote>This file is with Police. A new review starts when it comes back.</EmptyNote>
      ) : (
        <EmptyNote>The charging decision has been made. To reconsider it, reopen the decision.</EmptyNote>
      )}

      {concluded.length > 0 && (
        <div className="flex flex-col gap-2">
          <h3>Concluded reviews</h3>
          <div role="list" className={cn('flex flex-col divide-y divide-border/60 border-y border-border/60')}>
            {concluded.map((review) => {
              const outcome = review.standard === 'threshold' ? review.thresholdOutcome : review.evidentialOutcome
              const decided = decisions.filter((d) => d.reviewId === review.id)
              return (
                <div key={review.id} role="listitem" className="flex flex-wrap items-center justify-between gap-2 py-3">
                  <div className="flex flex-col">
                    <strong>{standardLabel(review.standard)}{review.reopensDecisionId ? ', reopened' : ''}</strong>
                    <p>
                      {format(review.startedAt, 'PP')} to {format(review.concludedAt!, 'PP')}
                      {outcome ? `. ${review.standard === 'threshold' ? 'Threshold' : 'Evidential'} Test ${outcomeLabels[outcome].toLowerCase()}` : ''}
                      {review.publicInterestOutcome ? `. Public Interest Test ${outcomeLabels[review.publicInterestOutcome].toLowerCase()}` : ''}.
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
