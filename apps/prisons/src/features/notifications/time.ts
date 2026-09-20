import { format } from 'date-fns/format'
import { m } from '@/paraglide/messages'

/** A short time for a list: now, 5m, 3h, Yesterday, 12 Sep, 12 Sep 2025.
 * Short on purpose, so the subject keeps the room. */
export function shortTime(at: number, now = Date.now()) {
  const minutes = Math.floor((now - at) / 60_000)
  if (minutes < 1) return 'now'
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h`
  const days = Math.floor((new Date(now).setHours(0, 0, 0, 0) - new Date(at).setHours(0, 0, 0, 0)) / 86_400_000)
  if (days === 1) return m.notifications_yesterday()
  return format(at, new Date(at).getFullYear() === new Date(now).getFullYear() ? 'd MMM' : 'd MMM yyyy')
}
