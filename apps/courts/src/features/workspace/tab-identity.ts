import { areaMeta } from '@/data/navigationItems'
import { caseViews, isCaseView } from '@/features/cases/schema'
import { BookOpen01Icon, CalendarCheckOut01Icon, DashboardBrowsingIcon, FolderViewIcon, GavelIcon, LegalDocument01Icon } from '@hugeicons/core-free-icons'
import type { Location, TabIdentity as ShellIdentity } from '@pleadli/shell'

/** A stable identity for one location: the tab key, its kind, and where it
 * lives. Anything the bench can open in the workspace has one, an area (Orders,
 * Settings) as much as a case; a path that is neither has none and never
 * becomes a tab. */
export type TabIdentity =
  | { kind: 'overview'; key: string; to: string }
  | { kind: 'area'; key: string; to: string }
  | { kind: 'case'; key: string; recordId: string; to: string }
  | { kind: 'order'; key: string; recordId: string; to: string }
  | { kind: 'sitting'; key: string; recordId: string; to: string }
  | { kind: 'ruling'; key: string; recordId: string; to: string }
  | { kind: 'reference'; key: string; recordId: string; to: string }

/** Which tab, if any, a location is open as. Nothing is guessed. Cases is one
 * tab that remembers which view it was on; the cause list is one tab whatever
 * day it shows; Settings is one tab. */
export function identityForLocation(pathname: string, search: Record<string, unknown> = {}): TabIdentity | null {
  const path = pathname.length > 1 ? pathname.replace(/\/$/, '') : pathname
  if (path === '/') return { kind: 'overview', key: 'overview', to: '/' }

  const record = (pattern: RegExp, kind: 'case' | 'order' | 'sitting' | 'ruling' | 'reference'): TabIdentity | null => {
    const match = pattern.exec(path)
    return match ? { kind, key: `${kind}:${match[1]}`, recordId: match[1], to: path } : null
  }
  const found =
    record(/^\/cases\/([^/]+)$/, 'case') ?? record(/^\/orders\/([^/]+)$/, 'order') ?? record(/^\/sittings\/([^/]+)$/, 'sitting') ?? record(/^\/rulings\/([^/]+)$/, 'ruling') ?? record(/^\/library\/([^/]+)$/, 'reference')
  if (found) return found

  if (path === '/cases') {
    const view = isCaseView(search.view) ? search.view : 'open'
    return { kind: 'area', key: 'area:/cases', to: `/cases?view=${view}` }
  }
  if (path === '/cause-list') return { kind: 'area', key: 'area:/cause-list', to: typeof search.day === 'string' ? `/cause-list?day=${search.day}` : path }
  if (/^\/settings(\/[a-z-]+)?$/.test(path)) return { kind: 'area', key: 'area:/settings', to: path }

  if (areaMeta(path)) return { kind: 'area', key: `area:${path}`, to: path }
  return null
}

const RECORD_TITLES = { case: 'Case', order: 'Order', sitting: 'Sitting', ruling: 'Decision', reference: 'Library text' } as const

function titleFor(identity: TabIdentity, search: Record<string, unknown>): string {
  if (identity.kind === 'overview') return 'Today'
  if (identity.kind !== 'area') return RECORD_TITLES[identity.kind]
  if (identity.key === 'area:/cases') {
    const view = isCaseView(search.view) ? search.view : 'open'
    return caseViews.find((v) => v.id === view)?.label ?? 'Cases'
  }
  return areaMeta(identity.key.slice('area:'.length))?.label ?? identity.to
}

/** The shell's view of a location. */
export function resolveIdentity({ pathname, search }: Location): ShellIdentity | null {
  const identity = identityForLocation(pathname, search)
  return identity ? { key: identity.key, kind: identity.kind, to: identity.to, title: titleFor(identity, search) } : null
}

/** The icon a tab carries: the area's own icon, or one for the kind of record it is. */
export function tabIcon({ kind, to }: { kind: string; to: string }) {
  if (kind === 'overview') return DashboardBrowsingIcon
  if (kind === 'case') return FolderViewIcon
  if (kind === 'order') return GavelIcon
  if (kind === 'sitting') return CalendarCheckOut01Icon
  if (kind === 'ruling') return LegalDocument01Icon
  if (kind === 'reference') return BookOpen01Icon
  const [pathname, query = ''] = to.split('?')
  return areaMeta(pathname, Object.fromEntries(new URLSearchParams(query)))?.icon ?? DashboardBrowsingIcon
}
