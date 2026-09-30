import { areaMeta } from '@/data/navigationItems'
import { fileViews, isFileView } from '@/features/prosecution-files/schema'
import * as m from '@/paraglide/messages'
import type { WorkspaceTab } from './tabs-store'

/** A stable identity for one location: the tab key, its kind, and where it
 * lives. Anything the prosecutor can open in the workspace has one, an area
 * (Decisions, Settings) as much as a file; a path that is neither has none and
 * never becomes a tab. */
export type TabIdentity =
  | { kind: 'overview'; key: string; to: string }
  | { kind: 'area'; key: string; to: string }
  | { kind: 'file'; key: string; recordId: string; to: string }
  | { kind: 'document'; key: string; recordId: string; to: string }

/** Which tab, if any, a location is open as. Nothing is guessed. Files is one
 * tab that remembers which view it was on; Settings is one tab that remembers
 * its section. */
export function identityForLocation(pathname: string, search: Record<string, unknown> = {}): TabIdentity | null {
  const path = pathname.length > 1 ? pathname.replace(/\/$/, '') : pathname
  if (path === '/') return { kind: 'overview', key: 'overview', to: '/' }

  const fileMatch = /^\/files\/([^/]+)$/.exec(path)
  if (fileMatch) return { kind: 'file', key: `file:${fileMatch[1]}`, recordId: fileMatch[1], to: path }

  const documentMatch = /^\/documents\/([^/]+)$/.exec(path)
  if (documentMatch) return { kind: 'document', key: `document:${documentMatch[1]}`, recordId: documentMatch[1], to: path }

  // A referral being read is still the Incoming tab.
  if (/^\/incoming(\/[^/]+)?$/.test(path)) return { kind: 'area', key: 'area:/incoming', to: path }

  if (path === '/files') {
    const view = isFileView(search.view) ? search.view : 'intake'
    return { kind: 'area', key: 'area:/files', to: `/files?view=${view}` }
  }
  if (path === '/material') {
    const kind = typeof search.kind === 'string' ? search.kind : 'statement'
    return { kind: 'area', key: 'area:/material', to: `/material?kind=${kind}` }
  }
  if (/^\/settings(\/[a-z-]+)?$/.test(path)) return { kind: 'area', key: 'area:/settings', to: path }

  if (areaMeta(path)) return { kind: 'area', key: `area:${path}`, to: path }
  return null
}

/** A tab's title for display, worked out at render time so it follows the
 * current language. Only a record's own title (a file's title, a document's
 * reference) is stored on the tab; areas and Overview are named from their
 * location every time they are drawn. */
export function tabTitle(tab: { kind: WorkspaceTab['kind']; title: string; to: string }): string {
  switch (tab.kind) {
    case 'overview':
      return m["tabs.overview"]()
    case 'file':
      return tab.title || m["tabs.file"]()
    case 'document':
      return tab.title || m["tabs.document"]()
    case 'area': {
      const [pathname, query = ''] = tab.to.split('?')
      const search = Object.fromEntries(new URLSearchParams(query))
      if (pathname === '/files') {
        const view = isFileView(search.view) ? search.view : 'intake'
        return fileViews.find((v) => v.id === view)?.label ?? m["tabs.files"]()
      }
      const identity = identityForLocation(pathname, search)
      const areaPath = identity ? identity.key.slice('area:'.length) : pathname
      return areaMeta(areaPath)?.label() ?? tab.to
    }
  }
}

/** Stores no display text: a record tab starts untitled and is renamed with
 * the record's own title once it loads (see `tabTitle`). */
export function tabFromIdentity(identity: TabIdentity): WorkspaceTab {
  return { key: identity.key, kind: identity.kind, title: '', to: identity.to }
}
