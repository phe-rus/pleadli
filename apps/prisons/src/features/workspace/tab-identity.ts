import { areaMeta } from '@/data/navigationItems'
import { documentKindLabel, isDocumentKind, type DocumentKind } from '@/features/documents/schema'
import type { WorkspaceTab } from './tabs-store'
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
export function identityForPath(pathname: string): TabIdentity | null {
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
 * the record has loaded (`useSyncActiveTabTitle`); until then it is honest
 * about being a file. */
function identityTitle(identity: TabIdentity, isHeadOffice: boolean): string {
  switch (identity.kind) {
    case 'today':
      return isHeadOffice ? m.workspace_overview() : m.workspace_today()
    case 'area':
      // A settings section is still the Settings tab: name it from the area, not the path.
      return areaMeta(identity.key.slice('area:'.length))?.label ?? identity.to
    case 'procedure':
      return procedureTitles[identity.procedureKind]
    case 'document':
      return documentKindLabel[identity.documentKind]
    case 'report':
      return m.workspace_report()
    case 'prisoner':
      return m.workspace_prisoner_file()
  }
}

export function tabFromIdentity(identity: TabIdentity, isHeadOffice: boolean): WorkspaceTab {
  return {
    key: identity.key,
    kind: identity.kind,
    title: identityTitle(identity, isHeadOffice),
    to: identity.to,
  }
}
