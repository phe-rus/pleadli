/**
 * What the screen shows for a moment: the institution's own time zone, with
 * the UTC offset written out. The computer's zone is never read. This mirrors
 * `pleadli_node_core::timezone` (the Rust side used for papers and exports)
 * so a screen and the paper print the same time.
 *
 * Moments are UTC epoch milliseconds everywhere. A zone change is a new entry
 * effective from a moment, so an old event keeps the zone it was made in.
 */

export type ZoneChange = { effectiveFromMs: number; zoneId: string }

let history: ZoneChange[] = []

/** Replaces the history this window displays with. With no entries, times read as UTC (never the computer's zone). */
export function setZoneHistory(next: ZoneChange[]) {
  history = [...next].sort((a, b) => a.effectiveFromMs - b.effectiveFromMs)
}

/** From the status the app's API returns: its history, or the zone in force (a country default) when none was ever chosen. */
export function installZone(status: { zoneId: string | null; history: ZoneChange[] }) {
  setZoneHistory(status.history.length ? status.history : status.zoneId ? [{ effectiveFromMs: Number.MIN_SAFE_INTEGER, zoneId: status.zoneId }] : [])
}

/** The zone in force at a moment; the first zone for a moment before any entry; null when none is set. */
export function zoneAt(ms: number): string | null {
  if (!history.length) return null
  for (let i = history.length - 1; i >= 0; i--) if (history[i].effectiveFromMs <= ms) return history[i].zoneId
  return history[0].zoneId
}

const formatters = new Map<string, Intl.DateTimeFormat>()
function parts(ms: number, zone: string, longOffset = false) {
  const key = `${zone}|${longOffset}`
  let f = formatters.get(key)
  if (!f) {
    f = new Intl.DateTimeFormat('en-GB', {
      timeZone: zone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      ...(longOffset ? { timeZoneName: 'longOffset' as const } : {}),
    })
    formatters.set(key, f)
  }
  const out: Record<string, string> = {}
  for (const p of f.formatToParts(new Date(ms))) out[p.type] = p.value
  return out
}

/** "UTC+03:00" for the offset the zone had at that moment. */
export function offsetLabel(ms: number, zone: string): string {
  const raw = parts(ms, zone, true).timeZoneName ?? 'GMT'
  const m = /GMT([+-]\d{1,2}(?::\d{2})?)?/.exec(raw)
  if (!m?.[1]) return 'UTC+00:00'
  const [h, min = '00'] = m[1].slice(1).split(':')
  return `UTC${m[1][0]}${h.padStart(2, '0')}:${min}`
}

/** "2026-11-21 14:30 (UTC+03:00)". */
export function formatInstant(ms: number): string {
  const zone = zoneAt(ms) ?? 'UTC'
  const p = parts(ms, zone)
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute} (${offsetLabel(ms, zone)})`
}

/** The calendar date at the institution, "2026-11-21". */
export function institutionDate(ms: number): string {
  const p = parts(ms, zoneAt(ms) ?? 'UTC')
  return `${p.year}-${p.month}-${p.day}`
}

/**
 * A Date whose *local* fields (getHours, getDate...) read the institution's wall time, so a formatter that
 * reads local fields (date-fns) prints the institution's time whatever the computer's zone is. Use it only
 * to format, never to store or compare.
 */
export function wallClock(ms: number): Date {
  const p = parts(ms, zoneAt(ms) ?? 'UTC')
  return new Date(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour), Number(p.minute), Number(p.second))
}

/** The zone to hand to `Intl.DateTimeFormat({ timeZone })` for a moment, so a localized date reads in the institution's zone. */
export const zoneFor = (ms: number): string => zoneAt(ms) ?? 'UTC'

/** The institution's UTC offset in milliseconds at a moment (+3h for Kampala), for day arithmetic: `ms + offsetMs(ms)` read in UTC fields is the wall clock. */
export function offsetMs(ms: number): number {
  const m = /^UTC([+-])(\d{2}):(\d{2})$/.exec(offsetLabel(ms, zoneAt(ms) ?? 'UTC'))
  if (!m) return 0
  return (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3])) * 60_000
}

/** The moment a wall-clock time (year, 0-based month, day, hour, minute) happens at the institution. A time the clock skips or repeats resolves to the first moment it could mean. */
export function instantAt(y: number, mo: number, d: number, h = 0, mi = 0): number {
  const wall = Date.UTC(y, mo, d, h, mi)
  const a = wall - offsetMs(wall - 12 * 3_600_000)
  const b = wall - offsetMs(a)
  return Math.min(a, b)
}
