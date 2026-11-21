import { zoneFor } from '@pleadli/ui/lib/institution-zone'
import { getLocale } from '@/paraglide/runtime'

/** Days as this practice keeps them (its configured zone, never the computer's or a fixed country), in the reader's language.
 * Display only. */
const zone = zoneFor

export const formatDay = (ms: number) => new Intl.DateTimeFormat(getLocale(), { day: 'numeric', month: 'short', year: 'numeric', timeZone: zone(ms) }).format(ms)
export const formatWeekday = (ms: number) => new Intl.DateTimeFormat(getLocale(), { weekday: 'short', day: 'numeric', month: 'short', timeZone: zone(ms) }).format(ms)
export const formatMonth = (ms: number) => new Intl.DateTimeFormat(getLocale(), { month: 'long', year: 'numeric', timeZone: zone(ms) }).format(ms)
export const formatTime = (ms: number) => new Intl.DateTimeFormat(getLocale(), { hour: '2-digit', minute: '2-digit', timeZone: zone(ms) }).format(ms)

/** "in 3 days", "2 days ago", in the reader's language. */
export const inDays = (days: number) => new Intl.RelativeTimeFormat(getLocale(), { numeric: 'auto' }).format(days, 'day')
