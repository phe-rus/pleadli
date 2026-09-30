import { getLocale } from '@/paraglide/runtime'

/**
 * Dates in the reader's language. `Intl` knows every language the app ships
 * (Kiswahili included, which date-fns does not), so a date follows the
 * language switch like every other word. Formats are named by purpose, not by
 * pattern, so the same kind of date looks the same everywhere.
 */

type Kind = 'date' | 'long' | 'datetime' | 'time' | 'weekday' | 'month' | 'monthShort'

const options: Record<Kind, Intl.DateTimeFormatOptions> = {
  date: { day: 'numeric', month: 'short', year: 'numeric' },
  long: { day: 'numeric', month: 'long', year: 'numeric' },
  datetime: { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' },
  time: { hour: '2-digit', minute: '2-digit' },
  weekday: { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' },
  month: { month: 'long', year: 'numeric' },
  monthShort: { month: 'short', year: '2-digit' },
}

const cache = new Map<string, Intl.DateTimeFormat>()

function formatter(kind: Kind, timeZone?: string) {
  const locale = getLocale()
  const key = `${locale}|${kind}|${timeZone ?? ''}`
  let f = cache.get(key)
  if (!f) {
    f = new Intl.DateTimeFormat(locale, { ...options[kind], timeZone })
    cache.set(key, f)
  }
  return f
}

export function formatDate(value: number | Date, kind: Kind = 'date', timeZone?: string) {
  return formatter(kind, timeZone).format(value)
}

export function formatNumber(value: number) {
  return new Intl.NumberFormat(getLocale()).format(value)
}

const relativeCache = new Map<string, Intl.RelativeTimeFormat>()

const relativeSteps: Array<[Intl.RelativeTimeFormatUnit, number]> = [
  ['year', 365 * 24 * 3600],
  ['month', 30 * 24 * 3600],
  ['week', 7 * 24 * 3600],
  ['day', 24 * 3600],
  ['hour', 3600],
  ['minute', 60],
  ['second', 1],
]

/** "3 days ago" / "il y a 3 jours": how long ago (or until) a moment is, in the reader's language. */
export function formatRelative(value: number | Date, now: number = Date.now()) {
  const locale = getLocale()
  let f = relativeCache.get(locale)
  if (!f) {
    f = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' })
    relativeCache.set(locale, f)
  }
  const seconds = Math.round((new Date(value).getTime() - now) / 1000)
  const [unit, size] = relativeSteps.find(([, s]) => Math.abs(seconds) >= s) ?? ['second', 1]
  return f.format(Math.round(seconds / size), unit)
}
