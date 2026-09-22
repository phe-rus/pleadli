import type { Workload } from '@/features/workload/schema'
import type { ProsecutionFile } from '@/features/prosecution-files/schema'

export type FileFacts = {
  file: ProsecutionFile
  statements: number
  evidence: number
  charges: number
  reviewNotes: number
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
      state: `Reopened for review${facts.openReview.reason ? `: ${facts.openReview.reason}` : '.'}`,
      next: 'Apply the test, record the findings, and record the decision that corrects the earlier one.',
      tab: 'review',
      label: 'Continue the review',
    }
  }
  if (facts.openReview) {
    return {
      state: `${facts.openReview.standard === 'threshold' ? 'Threshold Test' : 'Two-Stage Test'} review under way.`,
      next: 'Record the findings and the conclusion of each test, then the decision they support.',
      tab: 'review',
      label: 'Continue the review',
    }
  }

  switch (file.currentStatus) {
    case 'under_review':
      if (facts.reviewNotes > 0) {
        return { state: 'Observations recorded. No charging review started.', next: 'Start the charging review when you are ready to apply the test.', tab: 'review', label: 'Start the review' }
      }
      if (noMaterial) {
        return { state: 'Received from Police. No material recorded yet.', next: 'Record the statements, evidence and proposed charges that came with the referral.', tab: 'material', label: 'Record the material' }
      }
      return { state: 'Material recorded. The review has not begun.', next: 'Read the material and record your observations.', tab: 'review', label: 'Start the review' }
    case 'resubmitted':
      if (facts.directionsOpen > 0) {
        return {
          state: `Police have resubmitted this file. ${facts.directionsOpen} of ${facts.directionsTotal} directions are still open.`,
          next: 'Go through the directions, record what came back, then review and decide.',
          tab: 'decisions',
          label: 'Go through the directions',
        }
      }
      return { state: 'Police have resubmitted this file after further investigation.', next: 'Record what came back, review it, and decide.', tab: 'material', label: 'Record the new material' }
    case 'returned_for_investigation':
      return { state: `With Police for further investigation${facts.directionsTotal > 0 ? `, with ${facts.directionsTotal === 1 ? 'a direction' : `${facts.directionsTotal} directions`}` : ''}.`, next: 'Log the resubmission when the file comes back.', tab: 'decisions', label: 'Open decisions', action: 'resubmission' }
    case 'sanctioned':
    case 'plea_bargained':
      return file.courtCaseNumber
        ? { state: `Charged. Court case ${file.courtCaseNumber}.`, next: 'No further action recorded.', tab: 'court', label: 'Open court' }
        : { state: 'Charged. No court case number recorded yet.', next: 'Record the court case number once the charge sheet is filed.', tab: 'court', label: 'Record the case number' }
    default:
      return { state: 'The charging decision has been made and the file is concluded.', next: 'No further action recorded.', tab: 'decisions', label: 'Open decisions' }
  }
}

export function thresholdDueFor(workload: Workload | undefined, fileId: string) {
  return workload?.thresholdReviews.find((review) => review.fileId === fileId)?.dueAt ?? null
}
