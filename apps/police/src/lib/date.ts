import { getLocale } from '@/paraglide/runtime'
import type { FormatDistanceToken, Locale } from 'date-fns'
import { format as formatWith } from 'date-fns/format'
import { formatDistanceToNowStrict as distanceWith } from 'date-fns/formatDistanceToNowStrict'
import { de } from 'date-fns/locale/de'
import { enUS } from 'date-fns/locale/en-US'

/** Dates in the language the officer chose. Every page imports `format` and
 * `formatDistanceToNowStrict` from here instead of from date-fns, so month
 * names, weekdays and "3 hours ago" follow the language switch. The locale is
 * read when a date is drawn, so nothing needs to re-subscribe. */

const swMonthsWide = ['Januari', 'Februari', 'Machi', 'Aprili', 'Mei', 'Juni', 'Julai', 'Agosti', 'Septemba', 'Oktoba', 'Novemba', 'Desemba']
const swMonthsShort = ['Jan', 'Feb', 'Mac', 'Apr', 'Mei', 'Jun', 'Jul', 'Ago', 'Sep', 'Okt', 'Nov', 'Des']
const swDaysWide = ['Jumapili', 'Jumatatu', 'Jumanne', 'Jumatano', 'Alhamisi', 'Ijumaa', 'Jumamosi']
const swDaysShort = ['Jpi', 'Jtt', 'Jnn', 'Jtn', 'Alh', 'Iju', 'Jmo']

/** Swahili nouns for each unit, singular and plural. Seconds, minutes, hours,
 * days and weeks take the i/zi agreement; months and years take u/i. */
const swUnits: Record<string, { one: string; many: string; past: [string, string] }> = {
  second: { one: 'sekunde', many: 'sekunde', past: ['iliyopita', 'zilizopita'] },
  minute: { one: 'dakika', many: 'dakika', past: ['iliyopita', 'zilizopita'] },
  hour: { one: 'saa', many: 'saa', past: ['iliyopita', 'zilizopita'] },
  day: { one: 'siku', many: 'siku', past: ['iliyopita', 'zilizopita'] },
  week: { one: 'wiki', many: 'wiki', past: ['iliyopita', 'zilizopita'] },
  month: { one: 'mwezi', many: 'miezi', past: ['uliopita', 'iliyopita'] },
  year: { one: 'mwaka', many: 'miaka', past: ['uliopita', 'iliyopita'] },
}

const swTokenUnit: Record<FormatDistanceToken, { unit: string; prefix?: string }> = {
  lessThanXSeconds: { unit: 'second', prefix: 'chini ya' },
  xSeconds: { unit: 'second' },
  halfAMinute: { unit: 'second' },
  lessThanXMinutes: { unit: 'minute', prefix: 'chini ya' },
  xMinutes: { unit: 'minute' },
  aboutXHours: { unit: 'hour', prefix: 'takriban' },
  xHours: { unit: 'hour' },
  xDays: { unit: 'day' },
  aboutXWeeks: { unit: 'week', prefix: 'takriban' },
  xWeeks: { unit: 'week' },
  aboutXMonths: { unit: 'month', prefix: 'takriban' },
  xMonths: { unit: 'month' },
  aboutXYears: { unit: 'year', prefix: 'takriban' },
  xYears: { unit: 'year' },
  overXYears: { unit: 'year', prefix: 'zaidi ya' },
  almostXYears: { unit: 'year', prefix: 'karibu' },
}

const pick = (patterns: Record<'full' | 'long' | 'medium' | 'short', string>, width: string | undefined) =>
  patterns[width as keyof typeof patterns] ?? patterns.full

/** date-fns ships no Swahili locale, so this one is written here: English
 * parsing rules, Swahili words for months, weekdays and distances. */
const sw: Locale = {
  ...enUS,
  code: 'sw',
  formatDistance: (token, count, options) => {
    const { unit, prefix } = swTokenUnit[token]
    const amount = token === 'halfAMinute' ? 30 : count
    const words = swUnits[unit]
    const one = amount === 1
    const phrase = `${prefix ? `${prefix} ` : ''}${one ? words.one : words.many} ${amount}`
    if (!options?.addSuffix) return phrase
    return options.comparison && options.comparison > 0 ? `baada ya ${phrase}` : `${phrase} ${words.past[one ? 0 : 1]}`
  },
  formatLong: {
    date: ({ width }) => pick({ full: 'EEEE, d MMMM y', long: 'd MMMM y', medium: 'd MMM y', short: 'dd/MM/y' }, width),
    time: ({ width }) => pick({ full: 'HH:mm:ss zzzz', long: 'HH:mm:ss z', medium: 'HH:mm:ss', short: 'HH:mm' }, width),
    dateTime: () => '{{date}} {{time}}',
  },
  localize: {
    ...enUS.localize,
    ordinalNumber: (value) => String(value),
    month: (value, options) => (options?.width === 'wide' ? swMonthsWide : swMonthsShort)[value],
    day: (value, options) => (options?.width === 'wide' ? swDaysWide : swDaysShort)[value],
  },
}

function dateLocale(): Locale {
  const locale = getLocale()
  if (locale === 'de') return de
  if (locale === 'sw') return sw
  return enUS
}

export function format(date: Date | number, pattern: string) {
  return formatWith(date, pattern, { locale: dateLocale() })
}

export function formatDistanceToNowStrict(date: Date | number, options?: { addSuffix?: boolean }) {
  return distanceWith(date, { ...options, locale: dateLocale() })
}
