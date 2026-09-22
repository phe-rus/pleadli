/** Days as the court keeps them: the local day of the machine the bench sits
 * at (East Africa Time in Uganda), never the database's UTC day. */
export const DAY_MS = 86_400_000

export function startOfDay(at: number | Date): number {
  const d = new Date(at)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

/** The bounds `[from, to)` of the local day holding `at`. Built from calendar
 * fields, so a day is a day whatever the clock does. */
export function dayBounds(at: number | Date): { from: number; to: number } {
  const from = startOfDay(at)
  const next = new Date(from)
  next.setDate(next.getDate() + 1)
  return { from, to: next.getTime() }
}

/** `2026-09-21`, for a date in the address bar. */
export function toIsoDay(at: number | Date): string {
  const d = new Date(at)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function fromIsoDay(value: unknown): number | null {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const [y, m, d] = value.split('-').map(Number)
  const at = new Date(y, m - 1, d).getTime()
  return Number.isNaN(at) ? null : at
}

/** The value a `datetime-local` input wants. */
export function toDatetimeLocal(ms: number): string {
  const d = new Date(ms)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** A `date` input's value as a moment at the start of that local day, or null. */
export function fromDateInput(value: string): number | null {
  return value ? fromIsoDay(value) : null
}
