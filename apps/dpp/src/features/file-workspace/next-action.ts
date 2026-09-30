import type { Workload } from '@/features/workload/schema'
import { plural } from '@/lib/present'
import type { ProsecutionFile } from '@/features/prosecution-files/schema'
import * as m from '@/paraglide/messages'

export type FileFacts = {
  file: ProsecutionFile
  statements: number
  evidence: number
  charges: number
  reviewNotes: number
  /** Documents in the file's index (typed or scanned). */
  papers: number
  decisions: number
  /** From the file's own decisions, newest first: what the last return was. */
  returnedAt: number | null
  /** The review open on this file, if any. */
  directionsOpen: number
  directionsTotal: number
  openReview: { standard: string; reopens: boolean; reason: string | null } | null
  thresholdDueAt: number | null
}

export type NextAction = {
  /** What is true now, in one sentence. */
  state: string
  /** What the prosecutor does next. */
  next: string
  /** Which workspace tab that is done in. */
  tab: 'material' | 'review' | 'decisions' | 'court' | 'file'
  /** What the link to that tab says. */
  label: string
  /** The one button that does it, when it is a form rather than a place. */
  action?: 'resubmission'
}

/** The current state and next step of a file, said only from what the record
 * holds. Nothing here is a deadline: the one dated rule is the Threshold Test
 * review, shown separately. */
export function nextAction(facts: FileFacts): NextAction {
  const { file } = facts
  const noMaterial = facts.statements + facts.evidence + facts.charges === 0

  if (facts.openReview?.reopens) {
    return {
      state: facts.openReview.reason ? m["next.reopened_reason"]({ reason: facts.openReview.reason }) : m["next.reopened"](),
      next: m["next.reopened_next"](),
      tab: 'review',
      label: m["next.continue_review"](),
    }
  }
  if (facts.openReview) {
    return {
      state: m["next.under_way"]({ test: (facts.openReview.standard === 'threshold' ? m["review.test.threshold.label"]() : m["review.standard.two_stage.label"]()) }),
      next: m["next.under_way_next"](),
      tab: 'review',
      label: m["next.continue_review"](),
    }
  }

  switch (file.currentStatus) {
    case 'under_review':
      if (facts.reviewNotes > 0) {
        return { state: m["next.observations"](), next: m["next.observations_next"](), tab: 'review', label: m["next.start_review"]() }
      }
      if (noMaterial && facts.papers > 0) {
        return { state: m["next.papers"]({ count: facts.papers }), next: m["next.papers_next"](), tab: 'review', label: m["next.start_review"]() }
      }
      if (noMaterial) {
        return { state: m["next.received"](), next: m["next.received_next"](), tab: 'material', label: m["next.record_material"]() }
      }
      return { state: m["next.material"](), next: m["next.material_next"](), tab: 'review', label: m["next.start_review"]() }
    case 'resubmitted':
      if (facts.directionsOpen > 0) {
        return {
          state: m["next.resubmitted_open"]({ open: facts.directionsOpen, total: facts.directionsTotal }),
          next: m["next.resubmitted_open_next"](),
          tab: 'decisions',
          label: m["next.go_directions"](),
        }
      }
      return { state: m["next.resubmitted"](), next: m["next.resubmitted_next"](), tab: 'material', label: m["next.record_new_material"]() }
    case 'returned_for_investigation':
      return { state: facts.directionsTotal > 0 ? m["next.with_police_directions"]({ directions: plural(facts.directionsTotal, m["count.direction.one"], m["count.direction.many"]) }) : m["next.with_police"](), next: m["next.with_police_next"](), tab: 'decisions', label: m["next.open_decisions"](), action: 'resubmission' }
    case 'sanctioned':
    case 'plea_bargained':
      return file.courtCaseNumber
        ? { state: m["next.charged_case"]({ number: file.courtCaseNumber }), next: m["next.no_further"](), tab: 'court', label: m["next.open_court"]() }
        : { state: m["next.charged"](), next: m["next.charged_next"](), tab: 'court', label: m["next.record_case"]() }
    default:
      return { state: m["next.concluded"](), next: m["next.no_further"](), tab: 'decisions', label: m["next.open_decisions"]() }
  }
}

export function thresholdDueFor(workload: Workload | undefined, fileId: string) {
  return workload?.thresholdReviews.find((review) => review.fileId === fileId)?.dueAt ?? null
}
