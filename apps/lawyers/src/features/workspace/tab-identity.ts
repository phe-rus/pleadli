import * as m from '@/paraglide/messages'
import { areaMeta } from '@/data/navigationItems'
import { isMatterView, matterViews } from '@/features/matters/schema'
import { DashboardBrowsingIcon, FolderViewIcon, LegalDocument01Icon } from '@hugeicons/core-free-icons'
import type { Location, TabIdentity as ShellIdentity } from '@pleadli/shell'

/** A stable identity for one location: the tab key, its kind, and where it
 * lives. Anything the advocate can open in the workspace has one, an area (Tasks,
 * Settings) as much as a matter; a path that is neither has none and never
 * becomes a tab. */
export type TabIdentity =
  | { kind: 'overview'; key: string; to: string }
  | { kind: 'area'; key: string; to: string }
  | { kind: 'matter'; key: string; recordId: string; to: string }
  | { kind: 'document'; key: string; recordId: string; to: string }

/** Which tab, if any, a location is open as. Nothing is guessed. Matters is one
 * tab that remembers which view it was on; the diary is one tab whatever day it
 * shows; Settings is one tab. */
export function identityForLocation(pathname: string, search: Record<string, unknown> = {}): TabIdentity | null {
  const path = pathname.length > 1 ? pathname.replace(/\/$/, '') : pathname
  if (path === '/') return { kind: 'overview', key: 'overview', to: '/' }

  const matterMatch = /^\/matters\/([^/]+)$/.exec(path)
  if (matterMatch) return { kind: 'matter', key: `matter:${matterMatch[1]}`, recordId: matterMatch[1], to: path }

  const documentMatch = /^\/documents\/([^/]+)$/.exec(path)
  if (documentMatch) return { kind: 'document', key: `document:${documentMatch[1]}`, recordId: documentMatch[1], to: path }

  if (path === '/matters') {
    const view = isMatterView(search.view) ? search.view : 'open'
    return { kind: 'area', key: 'area:/matters', to: `/matters?view=${view}` }
  }
  if (path === '/diary') return { kind: 'area', key: 'area:/diary', to: typeof search.day === 'string' ? `/diary?day=${search.day}` : path }
  // Every section of Settings (and `/settings`, which redirects to one) is the
  // one Settings tab, remembering the section it was on.
  if (path === '/settings' || path.startsWith('/settings/')) return { kind: 'area', key: 'area:/settings', to: path === '/settings' ? '/settings/you' : path }

  if (areaMeta(path)) return { kind: 'area', key: `area:${path}`, to: path }
  return null
}

function titleFor(identity: TabIdentity, search: Record<string, unknown>): string {
  switch (identity.kind) {
    case 'overview':
      return m["nav.today"]()
    case 'matter':
      return m["nav.tab.matter"]()
    case 'document':
      return m["nav.tab.document"]()
    case 'area': {
      if (identity.key === 'area:/matters') {
        const view = isMatterView(search.view) ? search.view : 'open'
        return matterViews.find((v) => v.id === view)?.label ?? m["nav.section.matters"]()
      }
      return areaMeta(identity.key.slice('area:'.length))?.label ?? identity.to
    }
  }
}

/** The shell's view of a location. */
export function resolveIdentity({ pathname, search }: Location): ShellIdentity | null {
  const identity = identityForLocation(pathname, search)
  return identity ? { key: identity.key, kind: identity.kind, to: identity.to, title: titleFor(identity, search) } : null
}

/** What a tab or recent item is called now. A matter's or document's title is
 * its record's, so it is kept; every other label is worked out in the current
 * language, never read back from storage (a saved label stays in the language
 * it was saved in). */
export function tabLabel(tab: { kind: string; title: string; to: string }): string {
  if (tab.kind === 'matter' || tab.kind === 'document') return tab.title
  const [path, query = ''] = tab.to.split('?')
  const search = Object.fromEntries(new URLSearchParams(query))
  const identity = identityForLocation(path, search)
  return identity ? titleFor(identity, search) : tab.title
}

/** The icon a tab or recent item carries: the area's own icon, or one for the kind of record it is. */
export function tabIcon({ kind, to }: { kind: string; to: string }) {
  if (kind === 'overview') return DashboardBrowsingIcon
  if (kind === 'matter') return FolderViewIcon
  if (kind === 'document') return LegalDocument01Icon
  const [pathname, query = ''] = to.split('?')
  return areaMeta(pathname, Object.fromEntries(new URLSearchParams(query)))?.icon ?? DashboardBrowsingIcon
}
