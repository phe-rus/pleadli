import { areaMeta } from '@/data/navigationItems'
import { documentKindLabel, isDocumentKind, type DocumentKind } from '@/features/documents/schema'
import { prisonerFolder } from '@/features/prisoners/folders'
import { ArrowDataTransferHorizontalIcon, File02Icon, Home01Icon, PrisonerIcon } from '@hugeicons/core-free-icons'
import type { Location, TabIdentity as ShellIdentity } from '@pleadli/shell'
import { m } from '@/paraglide/messages'

/** A stable identity for one path: the tab key, its kind, and where it
 * lives. Anything the officer can open in the workspace has one, an area
 * (Population, Legal, Settings) as much as a record; a path that is neither
 * has none and never becomes a tab. */
export type TabIdentity =
  | { kind: 'today'; key: string; to: string }
  | { kind: 'area'; key: string; to: string }
  | { kind: 'prisoner'; key: string; recordId: string; to: string }
  | { kind: 'procedure'; key: string; procedureKind: string; recordId: string; to: string }
  | { kind: 'document'; key: string; documentKind: DocumentKind; recordId: string; to: string }
  | { kind: 'report'; key: string; recordId: string; to: string }

const procedureTitles: Record<string, string> = {
  get reception() { return m.workspace_reception() },
  get receive() { return m.workspace_receive_a_transfer() },
  get arrival() { return m.workspace_arrival_confirmation() },
  get discharge() { return m.workspace_discharge() },
  get transfer() { return m.workspace_transfer() },
}

/** Which tab, if any, a pathname is open as. Nothing is guessed: only routes
 * that parse as a known area, a prisoner file or a procedure have a tab. */
export function identityForPath(href: string): TabIdentity | null {
  const [pathname, query = ''] = href.split('?')
  // The prisoners list is one tab whichever folder it shows; the tab
  // remembers the folder, so coming back to it returns there.
  if (pathname.replace(/\/$/, '') === '/prisoners') {
    const view = new URLSearchParams(query).get('view')
    return { kind: 'area', key: 'area:/prisoners', to: view ? `/prisoners?view=${view}` : '/prisoners' }
  }
  if (pathname === '/') return { kind: 'today', key: 'today', to: '/' }

  const prisonerMatch = /^\/prisoners\/([^/]+)$/.exec(pathname)
  if (prisonerMatch) {
    const recordId = prisonerMatch[1]
    return { kind: 'prisoner', key: `prisoner:${recordId}`, recordId, to: `/prisoners/${recordId}` }
  }

  const documentMatch = /^\/documents\/([a-z_]+)\/([^/]+)$/.exec(pathname)
  if (documentMatch && isDocumentKind(documentMatch[1])) {
    const [, documentKind, recordId] = documentMatch as unknown as [string, DocumentKind, string]
    return { kind: 'document', key: `document:${documentKind}:${recordId}`, documentKind, recordId, to: pathname }
  }

  const reportMatch = /^\/reports\/(?!new$)([^/]+)$/.exec(pathname)
  if (reportMatch) return { kind: 'report', key: `report:${reportMatch[1]}`, recordId: reportMatch[1], to: pathname }

  const procedureMatch = /^\/procedures\/([a-z]+)(?:\/([^/]*))?$/.exec(pathname)
  if (procedureMatch) {
    const kind = procedureMatch[1]
    if (!(kind in procedureTitles)) return null
    const recordId = procedureMatch[2] || kind
    return { kind: 'procedure', key: `procedure:${kind}:${recordId}`, procedureKind: kind, recordId, to: pathname }
  }

  // Every Settings section is the one Settings tab; the tab remembers which
  // section it was on, so coming back to it returns there.
  if (/^\/settings(\/[a-z-]+)?\/?$/.test(pathname)) return { kind: 'area', key: 'area:/settings', to: pathname.replace(/\/$/, '') }

  const area = pathname.replace(/\/$/, '')
  if (areaMeta(area)) return { kind: 'area', key: `area:${area}`, to: area }

  return null
}

/** The title a tab opens with. A prisoner file takes the person's name once
 * the record has loaded; until then it is honest about being a file. */
function identityTitle(identity: TabIdentity): string {
  switch (identity.kind) {
    case "today":
      return m.workspace_today()
    case "area":
      if (identity.key === "area:/prisoners") return prisonerFolder(new URLSearchParams(identity.to.split("?")[1] ?? "").get("view") ?? undefined).label()
      // A settings section is still the Settings tab: name it from the area, not the path.
      return areaMeta(identity.key.slice("area:".length))?.label ?? identity.to
    case "procedure":
      return procedureTitles[identity.procedureKind]
    case "document":
      return documentKindLabel[identity.documentKind]
    case "report":
      return m.workspace_report()
    case "prisoner":
      return m.workspace_prisoner_file()
  }
}

/** The shell's view of a location. The prisoners list keeps its folder in the address, and its tab with it. */
export function resolveIdentity({ pathname, search }: Location): ShellIdentity | null {
  const identity = identityForPath(typeof search.view === "string" ? `${pathname}?view=${search.view}` : pathname)
  return identity ? { key: identity.key, kind: identity.kind, to: identity.to, title: identityTitle(identity) } : null
}

/** What a tab or recent item is called now. Today, areas and procedures are
 * named in the current language each time; a record keeps its own saved name. */
export function tabLabel(tab: { kind: string; to: string; title: string }): string {
  if (tab.kind === "prisoner" || tab.kind === "document" || tab.kind === "report") return tab.title
  const identity = identityForPath(tab.to)
  return identity ? identityTitle(identity) : tab.title
}

/** The icon a tab carries: the area's own icon, or one for the kind of record it is. */
export function tabIcon({ kind, to }: { kind: string; to: string }) {
  if (kind === "today") return Home01Icon
  if (kind === "prisoner") return PrisonerIcon
  if (kind === "procedure") return ArrowDataTransferHorizontalIcon
  if (kind === "document" || kind === "report") return File02Icon
  const path = to.split("?")[0]
  return (areaMeta(path) ?? areaMeta(`/${path.split("/")[1]}`))?.icon ?? Home01Icon
}
