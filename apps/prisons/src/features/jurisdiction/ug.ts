import type { JurisdictionPack } from './pack'
import { m } from '@/paraglide/messages'

/** Uganda, the one jurisdiction this build has. The regions are the Uganda
 * Prisons Service regions facilities are registered under. The numbering
 * default is provisional: no official format was found in public sources
 * (docs/prisons/RESEARCH.md), so a facility is asked to confirm it. */
export const ugRegions = [
  'Southern',
  'Northern',
  'Kigezi',
  'Mid Central',
  'Central',
  'Kampala Extra',
  'Eastern',
  'North Central',
  'Mid Western',
  'Mid Northern',
  'Mid Eastern',
  'South Western',
  'East Central',
  'North Eastern',
  'Iganga',
  'Western',
  'North Western',
  'Kooki',
  'South Eastern',
] as const

export const ugPack: JurisdictionPack = {
  id: 'ug',
  get name() {
    return m.jurisdiction_ug_name()
  },
  country: 'Uganda',
  timezone: {
    id: 'Africa/Kampala',
    get label() {
      return m.jurisdiction_ug_timezone()
    },
  },
  regions: ugRegions,
  numbering: { pattern: '{SEQ:4}/{YEAR}', reset: 'yearly', provisional: true },
  examples: { facilityCode: 'UG-LUZ-001', badge: 'UP-0142' },
}
