import { describe, expect, test } from 'bun:test'
import { jurisdictionPack, plannedJurisdictions } from '../src/features/jurisdiction'

describe('legal jurisdiction identity', () => {
  test('only a missing first-run value defaults to Uganda', () => {
    expect(jurisdictionPack(undefined).id).toBe('ug')
    expect(jurisdictionPack(null).id).toBe('ug')
    expect(jurisdictionPack('ug').country).toBe('Uganda')
  })
  test('unknown or planned countries never inherit Uganda law', () => {
    for (const id of ['cd', 'ke', '', 'unknown', 'constructor', '__proto__']) expect(() => jurisdictionPack(id)).toThrow()
  })
  test('country rollout preserves Congo before Kenya', () => {
    expect(plannedJurisdictions.map(country => country.id)).toEqual(['cd', 'ke'])
    expect(plannedJurisdictions.map(country => country.priority)).toEqual([2, 3])
  })
})
