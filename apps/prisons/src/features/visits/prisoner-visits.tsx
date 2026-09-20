import { ApiError } from '@/lib/api'
import { Badge } from '@pleadli/ui/badge'
import { Button } from '@pleadli/ui/button'
import { t } from '@pleadli/ui/goey-toaster'
import { format } from 'date-fns/format'
import { useState } from 'react'
import { VisitDetailDialog } from './visit-detail'
import { useApprovedVisitors, usePrisonerVisits, useSetVisitorStatus } from './queries'
import { idTypeLabel, visitStatusLabel, visitStatusVariant, visitTypeLabel } from './schema'
import { m } from '@/paraglide/messages'

/** One prisoner's visits, newest first. Suspends until loaded, so render it
 * inside a Suspense boundary (the prisoner page already is). */
export function PrisonerVisitsTable({ prisonerId }: { prisonerId: string }) {
  const { data: visits } = usePrisonerVisits(prisonerId)
  const [openId, setOpenId] = useState<string | null>(null)
  const open = visits.find((v) => v.id === openId) ?? null

  if (visits.length === 0) return <p className="text-xs text-muted-foreground">{m.visits_no_visits_recorded_for_this_prisoner()}</p>

  return (
    <>
      <table className="w-full text-xs">
        <thead>
          <tr className="text-left text-muted-foreground">
            <th className="py-1.5 pr-3 font-normal">{m.visits_when()}</th>
            <th className="py-1.5 pr-3 font-normal">{m.visits_visitor()}</th>
            <th className="py-1.5 pr-3 font-normal">{m.visits_type()}</th>
            <th className="py-1.5 pr-3 font-normal">{m.visits_status()}</th>
          </tr>
        </thead>
        <tbody>
          {visits.map((visit) => (
            <tr key={visit.id} className="cursor-pointer hover:bg-muted/40" onClick={() => setOpenId(visit.id)}>
              <td className="py-1.5 pr-3 whitespace-nowrap">{format(visit.visitedAt, 'PPp')}</td>
              <td className="py-1.5 pr-3">
                {visit.visitorName}
                {visit.relationship && <span className="text-muted-foreground"> · {visit.relationship}</span>}
              </td>
              <td className="py-1.5 pr-3">{visitTypeLabel(visit.visitType)}</td>
              <td className="py-1.5 pr-3">
                <Badge variant={visitStatusVariant(visit.status)}>{visitStatusLabel(visit.status)}</Badge>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <VisitDetailDialog visit={open} onClose={() => setOpenId(null)} />
    </>
  )
}

/** The visitors approved for a prisoner, with suspend and reinstate. */
export function PrisonerVisitors({ prisonerId }: { prisonerId: string }) {
  const { data: visitors } = useApprovedVisitors(prisonerId)
  const setStatus = useSetVisitorStatus(prisonerId)

  if (!visitors || visitors.length === 0) return <p className="text-xs text-muted-foreground">{m.visits_no_visitors_are_approved_for_this()}</p>

  const change = (visitorId: string, status: 'active' | 'suspended') => {
    let note: string | undefined
    if (status === 'suspended') {
      note = window.prompt(m.visits_why_is_this_visitor_suspended())?.trim()
      if (!note) return
    }
    setStatus.mutate(
      { visitorId, status, note },
      {
        onSuccess: () => t.success(status === 'suspended' ? m.visits_visitor_suspended() : m.visits_visitor_reinstated()),
        onError: (error) => t.error(m.visits_could_not_change_that(), { description: error instanceof ApiError ? error.message : m.visits_please_try_again() }),
      },
    )
  }

  return (
    <ul className="flex flex-wrap gap-3">
      {visitors.map((visitor) => (
        <li key={visitor.visitorId} className="flex min-w-56 flex-1 basis-56 flex-col gap-1 rounded-lg border border-border/60 p-3 text-xs">
          <div className="flex items-start justify-between gap-2">
            <span className="text-sm font-medium">{visitor.fullName}</span>
            {visitor.status === 'suspended' && <Badge variant="destructive">{m.visits_suspended_2()}</Badge>}
          </div>
          <span className="text-muted-foreground">
            {visitor.relationship ?? m.visits_visitor()} · {idTypeLabel(visitor.idType)} {visitor.idNumber ?? ''}
          </span>
          {visitor.phone && <span className="text-muted-foreground">{visitor.phone}</span>}
          <span className="text-muted-foreground">
            {m.visits_completed({ visitsCompleted: visitor.visitsCompleted })}{visitor.lastVisitAt ? m.visits_last({ lastVisitAt: format(visitor.lastVisitAt, 'PP') }) : ''}
          </span>
          {visitor.note && <span>{visitor.note}</span>}
          <div className="pt-1">
            <Button size="xs" variant="secondary" disabled={setStatus.isPending} onClick={() => change(visitor.visitorId, visitor.status === 'suspended' ? 'active' : 'suspended')}>
              {visitor.status === 'suspended' ? m.visits_reinstate() : m.visits_suspend()}
            </Button>
          </div>
        </li>
      ))}
    </ul>
  )
}
