import { format } from 'date-fns/format'
import { m } from '@/paraglide/messages'
import { bucketOf, type Bucket, type Obligation } from './schema'

const DAY_MS = 86_400_000

/** How many whole days past due, at least one. */
export function daysOverdue(obligation: Pick<Obligation, 'dueAt'>, now: number) {
  return obligation.dueAt == null ? 0 : Math.max(1, Math.floor((now - obligation.dueAt) / DAY_MS))
}

/** When an obligation falls due, in the words the queue uses. */
export function dueText(obligation: Pick<Obligation, 'dueAt'>, now: number, bucket: Bucket = bucketOf(obligation, now)) {
  if (obligation.dueAt == null) return m.obligations_awaiting()
  if (bucket === 'overdue') {
    const days = daysOverdue(obligation, now)
    return days === 1 ? m.obligations_one_day_overdue() : m.obligations_days_overdue({ days })
  }
  if (bucket === 'today') return m.obligations_today_at({ time: format(obligation.dueAt, 'p') })
  return format(obligation.dueAt, 'EEE d MMM')
}
