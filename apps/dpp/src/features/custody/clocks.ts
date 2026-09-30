import type { Country, TimeLimit } from '@pleadli/setup'
import type { CustodyEvent } from './data'

export type ClockStatus = 'running' | 'soon' | 'overdue' | 'met' | 'late'

export type Clock = {
  limit: TimeLimit
  /** Whom it runs for; null when the events name nobody. */
  person: string | null
  startedAt: number
  dueAt: number
  stoppedAt: number | null
  status: ClockStatus
}

const HOUR = 3_600_000

/**
 * The legal clocks, counted by the app from the custody record and the
 * country's rules. Nothing here is estimated: a clock exists only when the
 * event that starts it is recorded, and it stops only on a recorded event.
 */
export function computeClocks(events: readonly CustodyEvent[], country: Country | undefined, now = Date.now()): Clock[] {
  if (!country) return []
  const byPerson = new Map<string | null, CustodyEvent[]>()
  for (const e of events) {
    const key = e.personName?.trim().toLowerCase() || null
    byPerson.set(key, [...(byPerson.get(key) ?? []), e])
  }
  // Events that name nobody apply to everyone on the file.
  const shared = byPerson.get(null) ?? []
  const named = [...byPerson.entries()].filter(([k]) => k !== null)
  // One clock set per named person (with the unnamed events added to each), or one for the whole file.
  const groups = named.length > 0 ? named.map(([k, list]) => [k, [...list, ...shared].sort((a, b) => a.at - b.at)] as const) : [[null, [...shared].sort((a, b) => a.at - b.at)] as const]

  const clocks: Clock[] = []
  for (const [, list] of groups) {
    const person = list.find((e) => e.personName)?.personName ?? null
    for (const limit of country.timeLimits) {
      const starts = list.filter((e) => limit.starts.includes(e.kind))
      if (starts.length === 0) continue
      const start = limit.from === 'first' ? starts[0] : starts[starts.length - 1]
      const dueAt = start.at + limit.hours * HOUR
      const stop = list.find((e) => e.at > start.at && limit.stops.includes(e.kind) && e.id !== start.id)
      let status: ClockStatus
      if (stop) status = stop.at <= dueAt ? 'met' : 'late'
      else if (now > dueAt) status = 'overdue'
      else if (dueAt - now < Math.max(12 * HOUR, limit.hours * HOUR * 0.2)) status = 'soon'
      else status = 'running'
      clocks.push({ limit, person, startedAt: start.at, dueAt, stoppedAt: stop?.at ?? null, status })
    }
  }
  return clocks
}

/** The clocks that need someone now. */
export const urgent = (clocks: Clock[]) => clocks.filter((c) => c.status === 'overdue' || c.status === 'soon')
