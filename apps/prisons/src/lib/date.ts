import { instantAt, wallClock } from '@pleadli/ui/lib/institution-zone'
import { format as formatWith } from 'date-fns/format'

/** Dates as the facility keeps them: its configured timezone, never the computer's. Every page imports `format`
 * from here instead of from date-fns. See @pleadli/ui/lib/institution-zone. */
export function format(date: Date | number, pattern: string) {
  return formatWith(wallClock(+date), pattern)
}

/** The start of the facility's day containing a moment, as a moment. */
export function startOfDay(ms: number | Date): number {
  const w = wallClock(+ms)
  return instantAt(w.getFullYear(), w.getMonth(), w.getDate())
}

/** The start of the facility's day `days` after the one containing `ms`. */
export function startOfDayPlus(ms: number | Date, days: number): number {
  const w = wallClock(+ms)
  return instantAt(w.getFullYear(), w.getMonth(), w.getDate() + days)
}

export const isToday = (ms: number) => startOfDay(ms) === startOfDay(Date.now())
export const isTomorrow = (ms: number) => startOfDay(ms) === startOfDayPlus(Date.now(), 1)
