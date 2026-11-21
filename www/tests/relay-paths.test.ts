import { expect, test } from 'bun:test'
import { readFile } from 'node:fs/promises'
import { RELAY_PATHS, relayPairAllowed, relayPermitted } from '../src/lib/relay-paths'

const TYPE: Record<string, string> = { PoliceStation: 'police', DppOffice: 'dpp', CourtRegistry: 'courts', PrisonFacility: 'prisons', LawFirm: 'lawyers' }

/** The Rust table is the source of truth; this list must say exactly the same. */
test('the relay table matches the interchange crate path for path', async () => {
  const messages = await readFile(new URL('../../packages/interchange/src/messages.rs', import.meta.url), 'utf8')
  const rust = await readFile(new URL('../../packages/interchange/src/authorization.rs', import.meta.url), 'utf8')
  const kinds = new Map([...messages.matchAll(/pub const (KIND_[A-Z_]+): &str = "([a-z_]+)";/g)].map((m) => [m[1], m[2]]))
  const parsed = [...rust.matchAll(/^\s*p\((\w+), (\w+), (KIND_[A-Z_]+),/gm)].map((m) => `${TYPE[m[1]]}>${TYPE[m[2]]}:${kinds.get(m[3])}`).sort()
  expect(parsed.length).toBeGreaterThan(10)
  expect(RELAY_PATHS.map(([f, t, k]) => `${f}>${t}:${k}`).sort()).toEqual(parsed)
})

test('police and prisons have no path in either direction, for any kind', () => {
  expect(relayPairAllowed('police', 'prisons')).toBe(false)
  for (const [, , kind] of [...RELAY_PATHS, ['x', 'y', 'pairing_invite'] as const]) {
    expect(relayPermitted('police', 'prisons', kind)).toBe(false)
    expect(relayPermitted('prisons', 'police', kind)).toBe(false)
  }
})

test('a kind goes one way only, and unknown kinds and types are refused', () => {
  expect(relayPermitted('courts', 'prisons', 'custody_order')).toBe(true)
  expect(relayPermitted('prisons', 'courts', 'custody_order')).toBe(false)
  expect(relayPermitted('lawyers', 'prisons', 'custody_order')).toBe(false)
  expect(relayPermitted('lawyers', 'courts', 'case_filing')).toBe(false)
  expect(relayPermitted('courts', 'courts', 'court_notice')).toBe(false)
  expect(relayPermitted('police', 'dpp', 'anything')).toBe(false)
  expect(relayPermitted(undefined, 'dpp', 'referral')).toBe(false)
  expect(relayPermitted('police', 'dpp', 'pairing_invite')).toBe(true)
})
