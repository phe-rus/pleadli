const DAY = 86_400_000

/** Whole days since a moment. */
export function daysSince(at: number, now = Date.now()) {
  return Math.max(0, Math.floor((now - at) / DAY))
}

/** How long ago, in the units a prosecutor thinks in. */
export function ageLabel(at: number, now = Date.now()) {
  const days = daysSince(at, now)
  if (days === 0) return 'Today'
  if (days === 1) return '1 day'
  if (days < 14) return `${days} days`
  const weeks = Math.floor(days / 7)
  return `${weeks} weeks`
}

export function plural(count: number, one: string, many = `${one}s`) {
  return `${count} ${count === 1 ? one : many}`
}
