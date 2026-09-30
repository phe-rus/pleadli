import type { CourtProduction } from '@/features/court-productions'
import { courtOutcomeLabel, productionMethodLabel } from '@/features/court-productions'
import { stayEntryKinds, stayExitKinds, type Stay } from '@/features/custody'
import { healthEventTypeLabel, type HealthEvent } from '@/features/health-events'
import { releaseTypeLabel, type Release } from '@/features/releases'
import { transferDirectionLabel, transferStateLabel, type Transfer } from '@/features/transfers'
import { visitStatusLabel, visitTypeLabel, type Visit } from '@/features/visits'
import { inlineLabel } from '@/features/i18n'
import { m } from '@/paraglide/messages'

/** Display label for a timeline entry's kind code. The code stays the value. */
export function timelineKindLabel(kind: string) {
  switch (kind) {
    case 'Stay':
      return m.timeline_kind_stay()
    case 'Court':
      return m.timeline_kind_court()
    case 'Visit':
      return m.timeline_kind_visit()
    case 'Health':
      return m.timeline_kind_health()
    case 'Transfer':
      return m.timeline_kind_transfer()
    case 'Release':
      return m.timeline_kind_release()
    default:
      return kind
  }
}

export type TimelineEntry = { id: string; at: number; kind: string; title: string; detail: string | null }

export function buildTimeline(input: {
  stays: readonly Stay[]
  productions: readonly CourtProduction[]
  visits: readonly Visit[]
  healthEvents: readonly HealthEvent[]
  transfers: readonly Transfer[]
  releases: readonly Release[]
}): TimelineEntry[] {
  const entries: TimelineEntry[] = []

  for (const stay of input.stays) {
    const entry = stayEntryKinds[stay.entryKind as keyof typeof stayEntryKinds] ?? stay.entryKind
    entries.push({ id: `stay-in-${stay.id}`, at: stay.enteredAt, kind: 'Stay', title: m.prisoners_stay_entered({ entry }), detail: null })
    if (stay.exitedAt != null) {
      const exit = stayExitKinds[stay.exitKind as keyof typeof stayExitKinds] ?? stay.exitKind ?? m.prisoners_left_plain()
      entries.push({ id: `stay-out-${stay.id}`, at: stay.exitedAt, kind: 'Stay', title: m.prisoners_stay_left({ exit }), detail: null })
    }
  }
  for (const p of input.productions) {
    entries.push({
      id: `court-${p.id}`,
      at: p.productionDate,
      kind: 'Court',
      title: m.prisoners_court_production({ method: inlineLabel(productionMethodLabel(p.productionMethod)) }),
      detail: [p.courtReference, p.outcome ? courtOutcomeLabel(p.outcome) : m.prisoners_scheduled()].filter(Boolean).join(' · '),
    })
  }
  for (const v of input.visits) {
    entries.push({
      id: `visit-${v.id}`,
      at: v.visitedAt,
      kind: 'Visit',
      title: `${visitTypeLabel(v.visitType)}: ${v.visitorName}`,
      detail: visitStatusLabel(v.status),
    })
  }
  for (const h of input.healthEvents) {
    entries.push({ id: `health-${h.id}`, at: h.occurredAt, kind: 'Health', title: healthEventTypeLabel(h.eventType), detail: h.facilityName })
  }
  for (const t of input.transfers) {
    entries.push({
      id: `transfer-${t.id}`,
      at: t.transferredAt,
      kind: 'Transfer',
      title: `${transferDirectionLabel(t.direction)}: ${transferStateLabel(t.direction, t.state)}`,
      detail: t.otherPrisonName,
    })
  }
  for (const r of input.releases) {
    entries.push({
      id: `release-${r.id}`,
      at: r.releasedAt,
      kind: 'Release',
      title: releaseTypeLabel(r.releaseType),
      detail: r.exceptionReason ? m.prisoners_excepted_discharge() : r.orderedBy,
    })
  }

  return entries.sort((a, b) => b.at - a.at)
}
