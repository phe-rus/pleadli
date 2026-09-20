import { Badge } from '@pleadli/ui/badge'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@pleadli/ui/dialog'
import { format } from 'date-fns/format'
import type { ReactNode } from 'react'
import { VisitActions } from './visit-actions'
import { useVisitItems } from './queries'
import { itemDispositionLabel, visitStatusLabel, visitStatusVariant, visitTypeLabel, type Visit } from './schema'
import { m } from '@/paraglide/messages'

function Row({ label, children }: { label: string; children: ReactNode }) {
  if (children === null || children === undefined || children === '') return null
  return (
    <div className="flex flex-col gap-0.5 sm:flex-row sm:gap-3">
      <dt className="w-36 shrink-0 text-muted-foreground">{label}</dt>
      <dd className="min-w-0 flex-1">{children}</dd>
    </div>
  )
}

const time = (ms: number | null) => (ms ? format(ms, 'PPp') : null)

function duration(visit: Visit) {
  if (!visit.startedAt || !visit.endedAt) return null
  const minutes = Math.max(1, Math.round((visit.endedAt - visit.startedAt) / 60000))
  return `${minutes} min`
}

/** Everything known about one visit, and its next step. */
export function VisitDetailDialog({ visit, prisonerName, onClose }: { visit: Visit | null; prisonerName?: string; onClose: () => void }) {
  const { data: items } = useVisitItems(visit?.id ?? '', Boolean(visit))
  return (
    <Dialog open={visit !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        {visit && (
          <>
            <DialogHeader>
              <DialogTitle className="flex flex-wrap items-center gap-2">
                {visit.visitorName}
                <Badge variant={visitStatusVariant(visit.status)}>{visitStatusLabel(visit.status)}</Badge>
              </DialogTitle>
              <DialogDescription>
                {visitTypeLabel(visit.visitType)}
                {prisonerName ? m.visits_to_see_2({ prisonerName }) : ''}
              </DialogDescription>
            </DialogHeader>

            {visit.privileged && (
              <p className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs">
                {m.visits_privileged_visit_seen_within_sight_but()}
              </p>
            )}

            <dl className="flex flex-col gap-2 text-xs">
              <Row label={m.visits_scheduled()}>{time(visit.visitedAt)}</Row>
              <Row label={m.visits_planned_length()}>{m.visits_min({ durationMinutes: visit.durationMinutes })}</Row>
              <Row label={m.visits_visitors_in_party()}>{String(visit.partySize)}</Row>
              <Row label={m.visits_relationship()}>{visit.relationship}</Row>
              <Row label={m.visits_identification()}>{visit.visitorIdentification}</Row>
              <Row label={m.visits_decided_by()}>{visit.decidedBy ? `${visit.decidedBy}, ${time(visit.decidedAt)}` : null}</Row>
              <Row label={m.visits_reason()}>{visit.decisionReason}</Row>
              <Row label={m.visits_checked_in()}>{visit.checkedInAt ? m.visits_by({ checkedInAt: time(visit.checkedInAt) ?? '', checkedInBy: visit.checkedInBy ?? 'unknown' }) : null}</Row>
              <Row label={m.visits_id_and_search()}>{visit.checkedInAt ? m.visits_id_checked_and_search_done() : null}</Row>
              <Row label={m.visits_started()}>{time(visit.startedAt)}</Row>
              <Row label={m.visits_ended()}>{time(visit.endedAt)}</Row>
              <Row label={m.visits_length()}>{duration(visit)}</Row>
              <Row label={m.visits_supervising_officer()}>{visit.supervisingOfficer}</Row>
              <Row label={m.visits_notes()}>{visit.privileged ? null : visit.notes}</Row>
              <Row label={m.visits_items()}>
                {items && items.length > 0 ? (
                  <ul className="flex flex-col gap-0.5">
                    {items.map((item) => (
                      <li key={item.id}>
                        {item.description} <span className="text-muted-foreground">({itemDispositionLabel(item.disposition)})</span>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </Row>
            </dl>

            <VisitActions visit={visit} />
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
