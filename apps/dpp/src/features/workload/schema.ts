import * as m from '@/paraglide/messages'
import * as z from 'zod'
import { decisionTypeLabel } from '@/features/decisions/schema'
import { directionKindLabel } from '@/features/directions/schema'
import { evidenceCategoryLabel } from '@/features/evidence/schema'
import { statementRoleLabel } from '@/features/statements/schema'

export const workloadSchema = z.object({
  totalFiles: z.number(),
  awaitingDecision: z.number(),
  intake: z.number(),
  inReview: z.number(),
  resubmitted: z.number(),
  returned: z.number(),
  concluded: z.number(),
  reopened: z.number(),
  charged: z.number(),
  courtMatters: z.number(),
  chargedWithoutCourtReference: z.number(),
  decisionsTotal: z.number(),
  decisionsLast30Days: z.number(),
  people: z.number(),
  draftDocuments: z.number(),
  incomingWaiting: z.number(),
  outgoingPending: z.number(),
  stations: z.array(z.object({ label: z.string(), count: z.number() })),
  oldestAwaitingSince: z.number().nullable(),
  ageBands: z.object({
    underAWeek: z.number(),
    oneToTwoWeeks: z.number(),
    twoToFourWeeks: z.number(),
    overFourWeeks: z.number(),
  }),
  weekly: z.array(z.object({ startsAt: z.number(), received: z.number(), decided: z.number() })),
  thresholdReviews: z.array(
    z.object({
      fileId: z.string(),
      fileTitle: z.string(),
      fileReference: z.string().nullable(),
      decidedAt: z.number(),
      dueAt: z.number(),
    }),
  ),
})

export type Workload = z.infer<typeof workloadSchema>

export const activityEventSchema = z.object({
  kind: z.string(),
  id: z.string(),
  fileId: z.string(),
  fileTitle: z.string(),
  fileReference: z.string().nullable(),
  at: z.number(),
  subject: z.string().nullable(),
  detail: z.string().nullable(),
})

export type ActivityEvent = z.infer<typeof activityEventSchema>

export const materialRowSchema = z.object({
  kind: z.string(),
  id: z.string(),
  fileId: z.string(),
  fileTitle: z.string(),
  fileReference: z.string().nullable(),
  at: z.number(),
  subject: z.string(),
  detail: z.string().nullable(),
})

export type MaterialRow = z.infer<typeof materialRowSchema>
export type MaterialKind = 'statement' | 'evidence' | 'charge'

/** One event in words. Only the kinds the record can actually produce. */
export function describeEvent(event: ActivityEvent): { title: string; detail?: string } {
  const detail = event.detail ?? undefined
  switch (event.kind) {
    case 'referral_received':
      return { title: m["event.referral"](), detail: [event.subject, event.detail].filter(Boolean).join(', ') || undefined }
    case 'resubmission_received':
      return { title: m["event.resubmission"](), detail: [event.subject, event.detail].filter(Boolean).join(', ') || undefined }
    case 'statement_added':
      return { title: m["event.statement"]({ what: statementRoleLabel(event.subject ?? '') }), detail }
    case 'evidence_added':
      return { title: m["event.evidence"]({ what: evidenceCategoryLabel(event.subject ?? '') }), detail }
    case 'charge_added':
      return { title: m["event.charge"]({ what: event.subject ?? '' }), detail }
    case 'review_note_added':
      return { title: m["event.review_note"](), detail: event.subject ? m["event.by"]({ name: event.subject }) : undefined }
    case 'direction_answered':
      return { title: (event.subject === 'met' ? m["event.direction_met"] : m["event.direction_not_met"])({ kind: directionKindLabel(event.detail ?? '') }) }
    case 'document_issued':
      return { title: m["event.document_issued"]({ what: event.subject ?? '' }), detail }
    case 'review_started':
      return { title: m["event.review_started"]({ test: (event.subject === 'threshold' ? m["review.test.threshold.label"]() : m["review.standard.two_stage.label"]()) }), detail: detail ? m["event.by"]({ name: detail }) : undefined }
    case 'review_reopened':
      return { title: m["event.review_reopened"]({ test: (event.subject === 'threshold' ? m["review.test.threshold.label"]() : m["review.standard.two_stage.label"]()) }), detail }
    case 'decision_corrected':
      return { title: m["event.decision_corrected"]({ what: decisionTypeLabel(event.subject ?? '') }), detail: detail ? m["event.by"]({ name: detail }) : undefined }
    case 'decision_recorded':
      return { title: m["event.decision_recorded"]({ what: decisionTypeLabel(event.subject ?? '') }), detail: detail ? m["event.by"]({ name: detail }) : undefined }
    case 'attachment_added':
      return { title: m["event.attachment"]({ what: event.subject ?? '' }) }
    default:
      return { title: event.kind }
  }
}

const spreadSchema = z.object({
  count: z.number(),
  medianDays: z.number().nullable(),
  meanDays: z.number().nullable(),
  longestDays: z.number().nullable(),
  bands: z.array(z.number()),
})

export type Spread = z.infer<typeof spreadSchema>

const waitingSchema = z.object({ fileId: z.string(), title: z.string(), reference: z.string().nullable(), since: z.number() })
const countSchema = z.object({ label: z.string(), count: z.number() })

export const capacitySchema = z.object({
  months: z.array(
    z.object({
      startsAt: z.number(),
      partial: z.boolean(),
      received: z.number(),
      resubmitted: z.number(),
      filesDecided: z.number(),
      returned: z.number(),
      documentsIssued: z.number(),
      awaitingAtEnd: z.number(),
      withPoliceAtEnd: z.number(),
    }),
  ),
  turnaround: z.object({ referralToDecision: spreadSchema, timeWithPolice: spreadSchema, documentToIssue: spreadSchema }),
  directionsMet: z.number(),
  directionsNotMet: z.number(),
  directionsOpen: z.number(),
  decisionMix: z.array(countSchema),
  byOffence: z.array(countSchema),
  longestWaiting: z.array(waitingSchema),
  longestWithPolice: z.array(waitingSchema),
})

export type Capacity = z.infer<typeof capacitySchema>
