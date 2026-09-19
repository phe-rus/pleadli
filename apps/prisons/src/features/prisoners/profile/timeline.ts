import type { CourtProduction } from '@/features/court-productions'
import { courtOutcomeLabel, productionMethodLabel } from '@/features/court-productions'
import { stayEntryKinds, stayExitKinds, type Stay } from '@/features/custody'
import { healthEventTypeLabel, type HealthEvent } from '@/features/health-events'
import { releaseTypeLabel, type Release } from '@/features/releases'
import { transferDirectionLabel, transferStateLabel, type Transfer } from '@/features/transfers'
import { visitStatusLabel, visitTypeLabel, type Visit } from '@/features/visits'

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
    entries.push({ id: `stay-in-${stay.id}`, at: stay.enteredAt, kind: 'Stay', title: `Entered: ${entry}`, detail: null })
    if (stay.exitedAt != null) {
      const exit = stayExitKinds[stay.exitKind as keyof typeof stayExitKinds] ?? stay.exitKind ?? 'Left'
      entries.push({ id: `stay-out-${stay.id}`, at: stay.exitedAt, kind: 'Stay', title: `Left: ${exit}`, detail: null })
    }
  }
  for (const p of input.productions) {
    entries.push({
      id: `court-${p.id}`,
      at: p.productionDate,
      kind: 'Court',
      title: `Court production, ${productionMethodLabel(p.productionMethod).toLowerCase()}`,
      detail: [p.courtReference, p.outcome ? courtOutcomeLabel(p.outcome) : 'Scheduled'].filter(Boolean).join(' · '),
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
      detail: r.exceptionReason ? 'Excepted discharge' : r.orderedBy,
    })
  }

  return entries.sort((a, b) => b.at - a.at)
}
