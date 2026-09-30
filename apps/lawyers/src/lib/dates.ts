import { getLocale } from '@/paraglide/runtime'

/** Days as Uganda keeps them (East Africa Time), in the reader's language.
 * Display only. */
const zone = 'Africa/Kampala'

export const formatDay = (ms: number) => new Intl.DateTimeFormat(getLocale(), { day: 'numeric', month: 'short', year: 'numeric', timeZone: zone }).format(ms)
export const formatWeekday = (ms: number) => new Intl.DateTimeFormat(getLocale(), { weekday: 'short', day: 'numeric', month: 'short', timeZone: zone }).format(ms)
export const formatMonth = (ms: number) => new Intl.DateTimeFormat(getLocale(), { month: 'long', year: 'numeric', timeZone: zone }).format(ms)
export const formatTime = (ms: number) => new Intl.DateTimeFormat(getLocale(), { hour: '2-digit', minute: '2-digit', timeZone: zone }).format(ms)

/** "in 3 days", "2 days ago", in the reader's language. */
export const inDays = (days: number) => new Intl.RelativeTimeFormat(getLocale(), { numeric: 'auto' }).format(days, 'day')
