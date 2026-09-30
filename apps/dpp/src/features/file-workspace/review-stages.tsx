import { Tag, type Tone } from '@/components/status-tag'
import { cn } from '@pleadli/ui/lib/utils'
import * as m from '@/paraglide/messages'

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
    { id: 'review', label: m["stage.review"](), about: m["stage.review_about"](), state: facts.reviewNotes > 0 ? 'done' : 'todo' },
    { id: 'assessment', label: m["stage.assessment"](), about: m["stage.assessment_about"](), state: review ? 'done' : 'todo' },
    { id: 'findings', label: m["stage.findings"](), about: m["stage.findings_about"](), state: review && concluded(review) ? 'done' : 'todo' },
    { id: 'decision', label: m["decision.form.decision"](), about: m["stage.decision_about"](), state: decision ? 'done' : 'todo' },
    { id: 'reasons', label: m["stage.reasons"](), about: m["stage.reasons_about"](), state: decision?.reasons ? 'done' : 'todo' },
    { id: 'action', label: m["stage.action"](), about: m["stage.action_about"](), state: producesDocument ? 'done' : 'planned' },
  ]
}

const stateTone: Record<Stage['state'], Tone> = { done: 'done', todo: 'open', planned: 'planned', available: 'neutral' }
const stateWord: Record<Stage['state'], () => string> = { done: () => m["stage.state.done"](), todo: () => m["stage.state.todo"](), planned: () => m["common.planned"](), available: () => m["stage.state.available"]() }

export function ReviewStages({ stages, className }: { stages: Stage[]; className?: string }) {
  return (
    <ol className={cn('grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-3', className)}>
      {stages.map((stage, index) => (
        <li key={stage.id} className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground tabular-nums">{index + 1}</span>
            <strong>{stage.label}</strong>
            <Tag tone={stateTone[stage.state]}>{stateWord[stage.state]()}</Tag>
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
