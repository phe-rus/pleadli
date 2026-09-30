import * as m from '@/paraglide/messages'

const DAY = 86_400_000

/** Whole days since a moment. */
export function daysSince(at: number, now = Date.now()) {
  return Math.max(0, Math.floor((now - at) / DAY))
}

/** How long ago, in the units a prosecutor thinks in. */
export function ageLabel(at: number, now = Date.now()) {
  const days = daysSince(at, now)
  if (days === 0) return m["age.today"]()
  if (days === 1) return m["age.one_day"]()
  if (days < 14) return m["age.days"]({ count: days })
  const weeks = Math.floor(days / 7)
  return m["age.weeks"]({ count: weeks })
}

type CountMessage = (params: { count: number }) => string

/** A count in words, picking the singular or plural message. Both messages
 * carry `{count}` so each language places the number where it belongs. */
export function plural(count: number, one: CountMessage, many: CountMessage) {
  return count === 1 ? one({ count }) : many({ count })
}
