import { areaMeta } from '@/data/navigationItems'
import { caseViews, isCaseView } from '@/features/cases/schema'
import type { WorkspaceTab } from './tabs-store'

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

  const caseMatch = /^\/cases\/([^/]+)$/.exec(path)
  if (caseMatch) return { kind: 'case', key: `case:${caseMatch[1]}`, recordId: caseMatch[1], to: path }

  const orderMatch = /^\/orders\/([^/]+)$/.exec(path)
  if (orderMatch) return { kind: 'order', key: `order:${orderMatch[1]}`, recordId: orderMatch[1], to: path }

  const sittingMatch = /^\/sittings\/([^/]+)$/.exec(path)
  if (sittingMatch) return { kind: 'sitting', key: `sitting:${sittingMatch[1]}`, recordId: sittingMatch[1], to: path }

  const rulingMatch = /^\/rulings\/([^/]+)$/.exec(path)
  if (rulingMatch) return { kind: 'ruling', key: `ruling:${rulingMatch[1]}`, recordId: rulingMatch[1], to: path }

  const libraryMatch = /^\/library\/([^/]+)$/.exec(path)
  if (libraryMatch) return { kind: 'reference', key: `reference:${libraryMatch[1]}`, recordId: libraryMatch[1], to: path }

  if (path === '/cases') {
    const view = isCaseView(search.view) ? search.view : 'open'
    return { kind: 'area', key: 'area:/cases', to: `/cases?view=${view}` }
  }
  if (path === '/cause-list') return { kind: 'area', key: 'area:/cause-list', to: typeof search.day === 'string' ? `/cause-list?day=${search.day}` : path }
  if (/^\/settings(\/[a-z-]+)?$/.test(path)) return { kind: 'area', key: 'area:/settings', to: path }

  if (areaMeta(path)) return { kind: 'area', key: `area:${path}`, to: path }
  return null
}

function titleFor(identity: TabIdentity, search: Record<string, unknown>): string {
  switch (identity.kind) {
    case 'overview':
      return 'Today'
    case 'case':
      return 'Case'
    case 'order':
      return 'Order'
    case 'sitting':
      return 'Sitting'
    case 'ruling':
      return 'Decision'
    case 'reference':
      return 'Library text'
    case 'area': {
      if (identity.key === 'area:/cases') {
        const view = isCaseView(search.view) ? search.view : 'open'
        return caseViews.find((v) => v.id === view)?.label ?? 'Cases'
      }
      return areaMeta(identity.key.slice('area:'.length))?.label ?? identity.to
    }
  }
}

export function tabFromIdentity(identity: TabIdentity, search: Record<string, unknown> = {}): WorkspaceTab {
  return { key: identity.key, kind: identity.kind, title: titleFor(identity, search), to: identity.to }
}
