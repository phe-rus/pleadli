import * as m from '@/paraglide/messages'
import {
  Agreement02Icon,
  Building03Icon,
  CourtHouseIcon,
  JusticeScale01Icon,
  Home09Icon,
  LegalDocument01Icon,
  Mortarboard02Icon,
  PoliceBadgeIcon,
  SignatureIcon,
  UserGroupIcon,
  Briefcase01Icon,
  UserShield01Icon,
} from '@hugeicons/core-free-icons'

/** The kinds of work a practice can switch on (docs/lawyers/REVIEW-2026-09-30.md,
 * section 4.2). The ids are the backend's; labels are display only. */
export const usageIds = ['civil', 'criminal', 'appeals', 'land', 'companies', 'family', 'employment', 'advisory', 'government', 'legal_aid', 'oaths', 'prosecution'] as const
export type Usage = (typeof usageIds)[number]

export type UsageDefinition = {
  id: Usage
  icon: typeof CourtHouseIcon
  label: () => string
  /** One line: what switching it on adds. */
  adds: () => string
  /** How far its rules have been checked against the law: `ready` when read
   * from primary sources, `provisional` when partly, `research` when not yet. */
  status: 'ready' | 'provisional' | 'research'
}

export const usages: readonly UsageDefinition[] = [
  { id: 'civil', icon: CourtHouseIcon, label: () => m["usage.civil.label"](), adds: () => m["usage.civil.adds"](), status: 'ready' },
  { id: 'criminal', icon: JusticeScale01Icon, label: () => m["usage.criminal.label"](), adds: () => m["usage.criminal.adds"](), status: 'ready' },
  { id: 'appeals', icon: LegalDocument01Icon, label: () => m["usage.appeals.label"](), adds: () => m["usage.appeals.adds"](), status: 'provisional' },
  { id: 'land', icon: Home09Icon, label: () => m["usage.land.label"](), adds: () => m["usage.land.adds"](), status: 'provisional' },
  { id: 'companies', icon: Building03Icon, label: () => m["usage.companies.label"](), adds: () => m["usage.companies.adds"](), status: 'research' },
  { id: 'family', icon: UserGroupIcon, label: () => m["usage.family.label"](), adds: () => m["usage.family.adds"](), status: 'research' },
  { id: 'employment', icon: Briefcase01Icon, label: () => m["usage.employment.label"](), adds: () => m["usage.employment.adds"](), status: 'research' },
  { id: 'advisory', icon: Agreement02Icon, label: () => m["usage.advisory.label"](), adds: () => m["usage.advisory.adds"](), status: 'ready' },
  { id: 'government', icon: UserShield01Icon, label: () => m["usage.government.label"](), adds: () => m["usage.government.adds"](), status: 'ready' },
  { id: 'legal_aid', icon: Mortarboard02Icon, label: () => m["usage.legal_aid.label"](), adds: () => m["usage.legal_aid.adds"](), status: 'provisional' },
  { id: 'oaths', icon: SignatureIcon, label: () => m["usage.oaths.label"](), adds: () => m["usage.oaths.adds"](), status: 'provisional' },
  { id: 'prosecution', icon: PoliceBadgeIcon, label: () => m["usage.prosecution.label"](), adds: () => m["usage.prosecution.adds"](), status: 'research' },
]

export const findUsage = (id: string) => usages.find((u) => u.id === id)

/** What a practice of each kind usually does, as the starting ticks in setup.
 * The person changes them freely. */
export const suggestedUsages: Record<'private' | 'government' | 'in_house' | 'legal_aid', readonly Usage[]> = {
  private: ['civil', 'criminal', 'land'],
  government: ['government', 'civil', 'advisory'],
  in_house: ['companies', 'advisory', 'employment'],
  legal_aid: ['legal_aid', 'criminal', 'family'],
}
