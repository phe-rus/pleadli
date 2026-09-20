import { addDays } from 'date-fns/addDays'
import { addMonths } from 'date-fns/addMonths'
import { format } from 'date-fns/format'
import { startOfDay } from 'date-fns/startOfDay'
import { startOfMonth } from 'date-fns/startOfMonth'
import { startOfYear } from 'date-fns/startOfYear'
import { subMonths } from 'date-fns/subMonths'
import { m } from '@/paraglide/messages'

export type PeriodPreset = 'this_month' | 'last_month' | 'last_3_months' | 'year_to_date' | 'custom'

export const periodPresets: readonly { id: PeriodPreset; label: () => string }[] = [
  { id: 'this_month', label: () => m.reports_period_this_month() },
  { id: 'last_month', label: () => m.reports_period_last_month() },
  { id: 'last_3_months', label: () => m.reports_period_last_3_months() },
  { id: 'year_to_date', label: () => m.reports_period_year_to_date() },
  { id: 'custom', label: () => m.reports_period_custom() },
]

/** A period as the node takes it: `to` is the first instant after it. */
export type PeriodRange = { from: number; to: number }

/** The range a preset means today, or a custom one from two `yyyy-mm-dd` days
 * (the last day included). `null` until a custom range is complete and sensible. */
export function periodRange(preset: PeriodPreset, customFrom: string, customTo: string, now = new Date()): PeriodRange | null {
  switch (preset) {
    case 'this_month':
      return { from: startOfMonth(now).getTime(), to: startOfMonth(addMonths(now, 1)).getTime() }
    case 'last_month':
      return { from: startOfMonth(subMonths(now, 1)).getTime(), to: startOfMonth(now).getTime() }
    case 'last_3_months':
      return { from: startOfMonth(subMonths(now, 3)).getTime(), to: startOfMonth(now).getTime() }
    case 'year_to_date':
      return { from: startOfYear(now).getTime(), to: addDays(startOfDay(now), 1).getTime() }
    case 'custom': {
      if (!customFrom || !customTo) return null
      const from = startOfDay(new Date(`${customFrom}T00:00:00`)).getTime()
      const to = addDays(startOfDay(new Date(`${customTo}T00:00:00`)), 1).getTime()
      return Number.isFinite(from) && Number.isFinite(to) && to > from ? { from, to } : null
    }
  }
}

/** "1 Sep 2026 to 30 Sep 2026": the end shown is the last day inside the period. */
export function periodText(from: number | null, to: number | null): string {
  if (from == null || to == null) return m.reports_as_at_generation()
  return m.reports_period_range({ from: format(from, 'd MMM yyyy'), to: format(to - 1, 'd MMM yyyy') })
}
