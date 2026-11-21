import { beforeEach, expect, test } from 'bun:test'
import { formatInstant, installZone, institutionDate, offsetLabel, setZoneHistory, wallClock, zoneAt } from './institution-zone'

// 2026-11-21T11:30:00Z
const T = 1_795_260_600_000

beforeEach(() => setZoneHistory([]))

test('Uganda and Kenya read East Africa Time, DR Congo its two zones', () => {
  for (const [zone, expected] of [
    ['Africa/Kampala', '2026-11-21 14:30 (UTC+03:00)'],
    ['Africa/Nairobi', '2026-11-21 14:30 (UTC+03:00)'],
    ['Africa/Kinshasa', '2026-11-21 12:30 (UTC+01:00)'],
    ['Africa/Lubumbashi', '2026-11-21 13:30 (UTC+02:00)'],
  ] as const) {
    setZoneHistory([{ effectiveFromMs: 0, zoneId: zone }])
    expect(formatInstant(T)).toBe(expected)
  }
})

test('with no zone chosen it reads as UTC, never the computer zone', () => {
  expect(formatInstant(T)).toBe('2026-11-21 11:30 (UTC+00:00)')
})

test('the computer zone makes no difference (run this file under several TZ values)', () => {
  installZone({ zoneId: 'Africa/Kampala', history: [] })
  expect(formatInstant(T)).toBe('2026-11-21 14:30 (UTC+03:00)')
  expect(institutionDate(T + 11 * 3600_000)).toBe('2026-11-22')
  const w = wallClock(T)
  expect([w.getFullYear(), w.getMonth() + 1, w.getDate(), w.getHours(), w.getMinutes()]).toEqual([2026, 11, 21, 14, 30])
})

test('history keeps old events in the zone they happened in', () => {
  setZoneHistory([
    { effectiveFromMs: 0, zoneId: 'Africa/Kinshasa' },
    { effectiveFromMs: T, zoneId: 'Africa/Lubumbashi' },
  ])
  expect(zoneAt(T - 1)).toBe('Africa/Kinshasa')
  expect(formatInstant(T - 3_600_000)).toBe('2026-11-21 11:30 (UTC+01:00)')
  expect(formatInstant(T)).toBe('2026-11-21 13:30 (UTC+02:00)')
  expect(zoneAt(-10)).toBe('Africa/Kinshasa')
})

test('a zone with daylight saving names the offset in force at that moment', () => {
  expect(offsetLabel(1_782_900_000_000, 'Europe/Paris')).toBe('UTC+02:00')
  expect(offsetLabel(1_767_225_600_000 + 20 * 86_400_000, 'Europe/Paris')).toBe('UTC+01:00')
})

test('day arithmetic follows the institution offset, not a fixed +3h', async () => {
  const { offsetMs, instantAt } = await import('./institution-zone')
  setZoneHistory([{ effectiveFromMs: 0, zoneId: 'Africa/Kampala' }])
  expect(offsetMs(T)).toBe(3 * 3_600_000)
  expect(instantAt(2026, 10, 21)).toBe(Date.UTC(2026, 10, 21) - 3 * 3_600_000)
  setZoneHistory([{ effectiveFromMs: 0, zoneId: 'Africa/Kinshasa' }])
  expect(offsetMs(T)).toBe(3_600_000)
  expect(instantAt(2026, 10, 21, 14, 30)).toBe(Date.UTC(2026, 10, 21, 13, 30))
  // Paris, clocks put back on 25 October 2026: 02:30 happens twice, the earlier is chosen. Forward on 29 March: 02:30 never happens.
  setZoneHistory([{ effectiveFromMs: 0, zoneId: 'Europe/Paris' }])
  expect(instantAt(2026, 9, 25, 2, 30)).toBe(Date.UTC(2026, 9, 25, 0, 30))
})
