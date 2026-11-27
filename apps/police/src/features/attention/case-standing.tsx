import * as m from '@/paraglide/messages'
import { format } from '@/lib/date'
import { Badge } from '@pleadli/ui/badge'
import { useAttention } from './queries'
import type { CaseStanding, Obligation } from './data'

const stageLine = (s: CaseStanding): string => {
  if (s.stage === 'with_dpp') return s.withDpp === 'accepted' ? m['attention.stand.accepted']() : m['attention.stand.awaiting']()
  const lines = {
    investigating: m['attention.stand.investigating'],
    returned: m['attention.stand.returned'],
    not_accepted: m['attention.stand.not_accepted'],
    declined: m['attention.stand.declined'],
    sanctioned: m['attention.stand.sanctioned'],
    closed: m['attention.stand.closed'],
  } as const
  return lines[s.stage as keyof typeof lines]()
}

const obligationLine = (o: Obligation): string => {
  const names = o.names.join(', ')
  const due = o.dueAt ? m['attention.stand.due']({ date: format(o.dueAt, 'PP') }) : ''
  switch (o.kind) {
    case 'directions': return m['attention.stand.directions']({ count: o.count, due })
    case 'not_accepted': return m['attention.stand.ob_not_accepted']()
    case 'declined': return m['attention.stand.ob_declined']()
    case 'witnesses': return m['attention.stand.witnesses']({ count: o.count, names, due })
    case 'exhibits': return m['attention.stand.exhibits']({ names })
  }
}

/** Where a case stands with the DPP and what the station still has to do on it. Read from the one attention answer;
 * nothing here decides what a status means. Says nothing for a case that is simply under investigation with nothing owed. */
export function CaseStandingCard({ caseId }: { caseId: string }) {
  const { data } = useAttention()
  const s = data?.cases.find((c) => c.caseId === caseId)
  if (!s) return null
  if (s.stage === 'investigating' && s.obligations.length === 0) return null
  return (
    <section className="flex flex-col gap-2 rounded-lg border bg-muted/30 p-4" aria-label={m['attention.stand.title']()}>
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-sm font-medium">{stageLine(s)}</h2>
        {s.obligations.length > 0 && <Badge variant="secondary">{m['attention.stand.to_do']({ count: s.obligations.length })}</Badge>}
      </div>
      {s.referredAt && (
        <p className="text-xs text-muted-foreground">
          {m['attention.stand.sent']({ office: s.referredTo ?? m['attention.stand.the_office'](), date: format(s.referredAt, 'PP') })}
          {s.referredBy ? ` · ${s.referredBy}` : ''}
        </p>
      )}
      {s.obligations.length > 0 && (
        <ul className="flex flex-col gap-1">
          {s.obligations.map((o, i) => (
            <li key={`${o.kind}-${i}`} className={o.urgent ? 'text-xs font-medium text-destructive' : 'text-xs'}>
              {obligationLine(o)}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
