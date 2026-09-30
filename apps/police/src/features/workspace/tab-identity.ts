import * as m from '@/paraglide/messages'
import { areaMeta } from '@/data/navigationItems'
import type { WorkspaceTab } from './tabs-store'

/** A stable identity for one location: the tab key, its kind, and where it
 * lives. Anything the officer can open in the workspace has one, an area
 * (Custody, Roster) as much as a case or a person; a path that is neither has
 * none and never becomes a tab. */
export type TabIdentity =
  | { kind: 'overview'; key: string; to: string }
  | { kind: 'area'; key: string; to: string }
  | { kind: 'case' | 'person' | 'chargesheet'; key: string; recordId: string; to: string }

/** Which tab, if any, a location is open as. Nothing is guessed. */
export function identityForLocation(pathname: string): TabIdentity | null {
  const path = pathname.length > 1 ? pathname.replace(/\/$/, '') : pathname
  if (path === '/') return { kind: 'overview', key: 'overview', to: '/' }

  const caseMatch = /^\/investigations\/([^/]+)$/.exec(path)
  if (caseMatch) return { kind: 'case', key: `case:${caseMatch[1]}`, recordId: caseMatch[1], to: path }

  const personMatch = /^\/search\/people\/([^/]+)$/.exec(path)
  if (personMatch) return { kind: 'person', key: `person:${personMatch[1]}`, recordId: personMatch[1], to: path }

  const sheetMatch = /^\/legal-forms\/([^/]+)$/.exec(path)
  if (sheetMatch) return { kind: 'chargesheet', key: `chargesheet:${sheetMatch[1]}`, recordId: sheetMatch[1], to: path }

  if (areaMeta(path)) return { kind: 'area', key: `area:${path}`, to: path }
  return null
}

function titleFor(identity: TabIdentity): string {
  switch (identity.kind) {
    case 'overview':
      return m["nav.overview"]()
    case 'case':
      return m["workspace.tab_case"]()
    case 'person':
      return m["workspace.tab_person"]()
    case 'chargesheet':
      return m["workspace.tab_chargesheet"]()
    case 'area':
      return areaMeta(identity.key.slice('area:'.length))?.label ?? identity.to
  }
}

/** The words a tab or recent item shows. Overview and areas are named in the
 * current language every time they are drawn, since their saved title keeps
 * the language it was opened in; a record keeps its own saved name (a case
 * reference, a person's name). */
export function tabLabel(tab: { kind: WorkspaceTab['kind']; to: string; title: string }): string {
  if (tab.kind === 'overview') return m["nav.overview"]()
  if (tab.kind === 'area') return areaMeta(tab.to.split('?')[0])?.label ?? tab.title
  return tab.title
}

export function tabFromIdentity(identity: TabIdentity): WorkspaceTab {
  return { key: identity.key, kind: identity.kind, title: titleFor(identity), to: identity.to }
}
