import { Tag, type Tone } from '@/components/status-tag'
import { cn } from '@pleadli/ui/lib/utils'

export type Stage = { id: string; label: string; about: string; state: 'done' | 'todo' | 'planned' | 'available' }

/** The shape of a charging review: review, assessment, findings, decision,
 * reasons, resulting action. Each reports progress from what is recorded:
 * a review note, a review started, the tests concluded, a decision that came
 * out of the review, its reasons, and the document or direction that follows. */
export function reviewStages(facts: {
  reviewNotes: number
  review: { standard: string; evidentialOutcome: string | null; publicInterestOutcome: string | null; thresholdOutcome: string | null; concludedAt: number | null } | null
  decision: { decisionType: string; reasons: string | null } | null
}): Stage[] {
  const { review, decision } = facts
  const concluded = (r: NonNullable<typeof review>) =>
    r.standard === 'threshold' ? r.thresholdOutcome !== null : r.evidentialOutcome === 'failed' || (r.evidentialOutcome === 'passed' && r.publicInterestOutcome !== null)
  const producesDocument = decision && ['sanction', 'threshold_charge', 'amend_charge', 'return_for_investigation', 'decline'].includes(decision.decisionType)
  return [
    { id: 'review', label: 'Review', about: 'Read the material and record observations.', state: facts.reviewNotes > 0 ? 'done' : 'todo' },
    { id: 'assessment', label: 'Assessment', about: 'Choose the test: the Two-Stage Test or the Threshold Test.', state: review ? 'done' : 'todo' },
    { id: 'findings', label: 'Findings', about: 'What each criterion found, and the conclusion of each test.', state: review && concluded(review) ? 'done' : 'todo' },
    { id: 'decision', label: 'Decision', about: 'The decision the findings support.', state: decision ? 'done' : 'todo' },
    { id: 'reasons', label: 'Reasons', about: 'Why, recorded with the decision.', state: decision?.reasons ? 'done' : 'todo' },
    { id: 'action', label: 'Resulting action', about: 'The document the decision produces: charge sheet, directions or written reasons.', state: producesDocument ? 'done' : 'planned' },
  ]
}

const stateTone: Record<Stage['state'], Tone> = { done: 'done', todo: 'open', planned: 'planned', available: 'neutral' }
const stateWord: Record<Stage['state'], string> = { done: 'Recorded', todo: 'Not yet', planned: 'Planned', available: 'Recorded in a file' }

export function ReviewStages({ stages, className }: { stages: Stage[]; className?: string }) {
  return (
    <ol className={cn('grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-3', className)}>
      {stages.map((stage, index) => (
        <li key={stage.id} className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground tabular-nums">{index + 1}</span>
            <strong>{stage.label}</strong>
            <Tag tone={stateTone[stage.state]}>{stateWord[stage.state]}</Tag>
          </div>
          <p>{stage.about}</p>
        </li>
      ))}
    </ol>
  )
}

/** The same stages without a file's progress: what the review consists of. */
export function reviewStagesOverview(): Stage[] {
  return reviewStages({ reviewNotes: 0, review: null, decision: null }).map((stage) => ({ ...stage, state: stage.state === 'planned' ? 'planned' : 'available' }))
}
