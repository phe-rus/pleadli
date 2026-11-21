import { format } from '@/lib/date'
import { instantAt, wallClock } from '@pleadli/ui/lib/institution-zone'
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

/** The range a preset means today, or a custom one from two `yyyy-mm-dd` days (the last day included). Days and months are the
 * facility's own (its configured timezone), not the computer's. `null` until a custom range is complete and sensible. */
export function periodRange(preset: PeriodPreset, customFrom: string, customTo: string, now = new Date()): PeriodRange | null {
  const w = wallClock(+now)
  const y = w.getFullYear()
  const mo = w.getMonth()
  const d = w.getDate()
  switch (preset) {
    case 'this_month':
      return { from: instantAt(y, mo, 1), to: instantAt(y, mo + 1, 1) }
    case 'last_month':
      return { from: instantAt(y, mo - 1, 1), to: instantAt(y, mo, 1) }
    case 'last_3_months':
      return { from: instantAt(y, mo - 3, 1), to: instantAt(y, mo, 1) }
    case 'year_to_date':
      return { from: instantAt(y, 0, 1), to: instantAt(y, mo, d + 1) }
    case 'custom': {
      if (!customFrom || !customTo) return null
      const a = /^(\d{4})-(\d{2})-(\d{2})$/.exec(customFrom)
      const b = /^(\d{4})-(\d{2})-(\d{2})$/.exec(customTo)
      if (!a || !b) return null
      const from = instantAt(Number(a[1]), Number(a[2]) - 1, Number(a[3]))
      const to = instantAt(Number(b[1]), Number(b[2]) - 1, Number(b[3]) + 1)
      return Number.isFinite(from) && Number.isFinite(to) && to > from ? { from, to } : null
    }
  }
}

/** "1 Sep 2026 to 30 Sep 2026": the end shown is the last day inside the period. */
export function periodText(from: number | null, to: number | null): string {
  if (from == null || to == null) return m.reports_as_at_generation()
  return m.reports_period_range({ from: format(from, 'd MMM yyyy'), to: format(to - 1, 'd MMM yyyy') })
}
