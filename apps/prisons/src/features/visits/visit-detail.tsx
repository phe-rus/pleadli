import { Badge } from '@pleadli/ui/badge'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@pleadli/ui/dialog'
import { format } from 'date-fns/format'
import type { ReactNode } from 'react'
import { VisitActions } from './visit-actions'
import { useVisitItems } from './queries'
import { itemDispositionLabel, visitStatusLabel, visitStatusVariant, visitTypeLabel, type Visit } from './schema'

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
                {prisonerName ? ` to see ${prisonerName}` : ''}
              </DialogDescription>
            </DialogHeader>

            {visit.privileged && (
              <p className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs">
                Privileged visit: seen within sight but not within hearing of an officer. Nothing said is recorded.
              </p>
            )}

            <dl className="flex flex-col gap-2 text-xs">
              <Row label="Scheduled">{time(visit.visitedAt)}</Row>
              <Row label="Planned length">{`${visit.durationMinutes} min`}</Row>
              <Row label="Visitors in party">{String(visit.partySize)}</Row>
              <Row label="Relationship">{visit.relationship}</Row>
              <Row label="Identification">{visit.visitorIdentification}</Row>
              <Row label="Decided by">{visit.decidedBy ? `${visit.decidedBy}, ${time(visit.decidedAt)}` : null}</Row>
              <Row label="Reason">{visit.decisionReason}</Row>
              <Row label="Checked in">{visit.checkedInAt ? `${time(visit.checkedInAt)} by ${visit.checkedInBy ?? 'unknown'}` : null}</Row>
              <Row label="ID and search">{visit.checkedInAt ? 'ID checked and search done' : null}</Row>
              <Row label="Started">{time(visit.startedAt)}</Row>
              <Row label="Ended">{time(visit.endedAt)}</Row>
              <Row label="Length">{duration(visit)}</Row>
              <Row label="Supervising officer">{visit.supervisingOfficer}</Row>
              <Row label="Notes">{visit.privileged ? null : visit.notes}</Row>
              <Row label="Items">
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
