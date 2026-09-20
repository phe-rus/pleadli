import { m } from '@/paraglide/messages'

/** Who decides a setting. Shown as a chip on every section so nobody has to
 * guess whether a change stays on this computer, applies to the facility, or
 * is Head Office's to make. */
export type Owner = 'facility' | 'organisation' | 'device' | 'head-office-set' | 'head-office-default'

export type SectionId = 'facility' | 'organisation' | 'numbering' | 'language' | 'appearance' | 'sign-in' | 'head-office' | 'network' | 'backup' | 'device'

export type SectionDef = {
  id: SectionId
  label: () => string
  about: () => string
  owner: Owner
  /** Which installation shows it. A section that means nothing for the other kind is not listed. */
  for: 'facility' | 'head-office' | 'both'
  /** Permissions of which the officer needs at least one. Empty means everyone signed in. */
  requires: readonly string[]
}

export const sections: readonly SectionDef[] = [
  { id: 'facility', label: () => m.settings_nav_facility(), about: () => m.settings_about_facility(), owner: 'facility', for: 'facility', requires: ['prisoner.read', 'node.manage'] },
  { id: 'organisation', label: () => m.settings_nav_organisation(), about: () => m.settings_about_organisation(), owner: 'organisation', for: 'head-office', requires: ['node.manage'] },
  { id: 'numbering', label: () => m.settings_nav_numbering(), about: () => m.settings_about_numbering(), owner: 'facility', for: 'both', requires: ['prisoner.read', 'node.manage', 'hq.estate.read'] },
  { id: 'language', label: () => m.settings_nav_language(), about: () => m.settings_about_language(), owner: 'facility', for: 'both', requires: [] },
  { id: 'appearance', label: () => m.settings_nav_appearance(), about: () => m.settings_about_appearance(), owner: 'device', for: 'both', requires: [] },
  { id: 'sign-in', label: () => m.settings_nav_sign_in(), about: () => m.settings_about_sign_in(), owner: 'facility', for: 'both', requires: ['node.manage'] },
  { id: 'head-office', label: () => m.settings_nav_head_office(), about: () => m.settings_about_head_office(), owner: 'facility', for: 'facility', requires: [] },
  { id: 'network', label: () => m.settings_nav_network(), about: () => m.settings_about_network(), owner: 'organisation', for: 'head-office', requires: [] },
  { id: 'backup', label: () => m.settings_nav_backup(), about: () => m.settings_about_backup(), owner: 'facility', for: 'both', requires: ['node.manage'] },
  { id: 'device', label: () => m.settings_nav_device(), about: () => m.settings_about_device(), owner: 'device', for: 'both', requires: ['node.manage'] },
]

/** The sections this officer can see on this kind of installation, in order.
 * `permissions` may be pending: until the session loads nothing is hidden,
 * and the node refuses what an officer may not do either way. */
export function visibleSections(isHeadOffice: boolean, permissions: readonly string[] | undefined): SectionDef[] {
  return sections.filter(
    (section) =>
      (section.for === 'both' || section.for === (isHeadOffice ? 'head-office' : 'facility')) &&
      (!permissions || section.requires.length === 0 || section.requires.some((permission) => permissions.includes(permission))),
  )
}

export const ownerLabel: Record<Owner, () => string> = {
  facility: () => m.settings_owner_facility(),
  organisation: () => m.settings_owner_organisation(),
  device: () => m.settings_owner_device(),
  'head-office-set': () => m.settings_owner_head_office_set(),
  'head-office-default': () => m.settings_owner_head_office_default(),
}

export const ownerHint: Record<Owner, () => string> = {
  facility: () => m.settings_owner_facility_hint(),
  organisation: () => m.settings_owner_organisation_hint(),
  device: () => m.settings_owner_device_hint(),
  'head-office-set': () => m.settings_owner_head_office_set_hint(),
  'head-office-default': () => m.settings_owner_head_office_default_hint(),
}
