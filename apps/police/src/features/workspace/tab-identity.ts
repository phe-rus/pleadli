import * as m from '@/paraglide/messages'
import { areaMeta } from '@/data/navigationItems'
import { BinocularsIcon, Home01Icon, File02Icon, UserIcon } from '@hugeicons/core-free-icons'
import type { Location, TabIdentity as ShellIdentity } from '@pleadli/shell'

/** A stable identity for one location: the tab key, its kind, and where it
 * lives. Anything the officer can open in the workspace has one, an area
 * (Custody, Roster) as much as a case or a person; a path that is neither has
 * none and never becomes a tab. */
export type TabIdentity =
  | { kind: 'overview'; key: string; to: string }
  | { kind: 'area'; key: string; to: string }
  | { kind: 'case' | 'person' | 'chargesheet'; key: string; recordId: string; to: string }

/** Which tab, if any, a location is open as. Nothing is guessed. */
export function identityForLocation(pathname: string, search: { view?: string } = {}): TabIdentity | null {
  const path = pathname.length > 1 ? pathname.replace(/\/$/, '') : pathname
  if (path === '/') return { kind: 'overview', key: 'overview', to: '/' }

  const caseMatch = /^\/investigations\/([^/]+)$/.exec(path)
  if (caseMatch) return { kind: 'case', key: `case:${caseMatch[1]}`, recordId: caseMatch[1], to: path }

  const personMatch = /^\/search\/people\/([^/]+)$/.exec(path)
  if (personMatch) return { kind: 'person', key: `person:${personMatch[1]}`, recordId: personMatch[1], to: path }

  const sheetMatch = /^\/legal-forms\/([^/]+)$/.exec(path)
  if (sheetMatch) return { kind: 'chargesheet', key: `chargesheet:${sheetMatch[1]}`, recordId: sheetMatch[1], to: path }

  // The case folders are one tab, which remembers the folder it was left on.
  if (path === '/investigations') return { kind: 'area', key: `area:${path}`, to: search.view ? `${path}?view=${search.view}` : path }
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
      const area = areaMeta(identity.key.slice('area:'.length))
      return area?.title ?? area?.label ?? identity.to
  }
}

/** The shell's view of a location. */
export function resolveIdentity({ pathname, search }: Location): ShellIdentity | null {
  const identity = identityForLocation(pathname, { view: typeof search.view === 'string' ? search.view : undefined })
  return identity ? { key: identity.key, kind: identity.kind, to: identity.to, title: titleFor(identity) } : null
}

/** The words a tab or recent item shows. Overview and areas are named in the
 * current language every time they are drawn, since their saved title keeps
 * the language it was opened in; a record keeps its own saved name (a case
 * reference, a person's name). */
export function tabLabel(tab: { kind: string; to: string; title: string }): string {
  if (tab.kind === 'overview') return m["nav.overview"]()
  if (tab.kind === 'area') { const area = areaMeta(tab.to.split('?')[0]); return area?.title ?? area?.label ?? tab.title }
  return tab.title
}

/** The icon a tab carries: the area's own icon, or one for the kind of record it is. */
export function tabIcon({ kind, to }: { kind: string; to: string }) {
  if (kind === 'overview') return Home01Icon
  if (kind === 'case') return BinocularsIcon
  if (kind === 'person') return UserIcon
  if (kind === 'chargesheet') return File02Icon
  return areaMeta(to.split('?')[0])?.icon ?? Home01Icon
}
