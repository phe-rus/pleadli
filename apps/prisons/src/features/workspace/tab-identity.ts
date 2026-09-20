import { prisonerFullName } from '@/features/prisoners/schema'
import { getPrisoner } from '@/features/prisoners/data'
import { useQuery } from '@tanstack/react-query'
import type { WorkspaceTab } from './tabs-store'

/** A stable identity for one path: the tab key, its kind, and where it
 * lives. Area views (Population, Legal, …) have no identity: they are
 * destinations the navigator highlights, never tabs. */
export type TabIdentity =
  | { kind: 'today'; key: string; to: string }
  | { kind: 'prisoner'; key: string; recordId: string; to: string }
  | { kind: 'procedure'; key: string; procedureKind: string; recordId: string; to: string }

const procedureIds: Record<string, string> = {
  '/procedures/reception': 'reception',
  '/procedures/receive': 'receive',
  '/procedures/arrival': 'arrival',
  '/procedures/discharge': 'discharge',
  '/procedures/transfer': 'transfer',
}

/** Which record, if any, a pathname is open for. Nothing is ever guessed:
 * only the routes that parse as records produce a tab identity. */
export function identityForPath(pathname: string): TabIdentity | null {
  if (pathname === '/') return { kind: 'today', key: 'today', to: '/' }

  const prisonerMatch = /^\/prisoners\/([^/]+)$/.exec(pathname)
  if (prisonerMatch) {
    const recordId = prisonerMatch[1]
    return { kind: 'prisoner', key: `prisoner:${recordId}`, recordId, to: `/prisoners/${recordId}` }
  }

  const procedureMatch = /^\/procedures\/([a-z]+)(?:\/)?([^/]*)$/.exec(pathname)
  if (procedureMatch) {
    const kind = procedureIds[`/procedures/${procedureMatch[1]}`] ?? null
    if (kind == null) return null
    const recordId = procedureMatch[2] || kind
    return { kind: 'procedure', key: `procedure:${kind}:${recordId}`, procedureKind: kind, recordId, to: pathname }
  }

  return null
}

/** Stable default title for a tab identity, used before (and until) the
 * record's own name is cached. The tab strip replaces it live from the
 * query cache. */
const procedureTitles: Record<string, string> = {
  reception: 'Reception',
  receive: 'Receive a transfer',
  arrival: 'Arrival confirmation',
  discharge: 'Discharge',
  transfer: 'Transfer',
}

export function identityTitle(identity: TabIdentity): WorkspaceTab['title'] {
  if (identity.kind === 'today') return 'Today'
  if (identity.kind === 'procedure') return procedureTitles[identity.procedureKind] ?? 'Procedure'
  return 'Prisoner file'
}

export function identitySubtitle(identity: TabIdentity): string | undefined {
  if (identity.kind === 'prisoner') return 'Prisoner file'
  if (identity.kind === 'procedure') return 'Procedure'
  return undefined
}

export function identityClosable(identity: TabIdentity): boolean {
  return identity.kind !== 'today'
}

export function tabFromIdentity(identity: TabIdentity): WorkspaceTab {
  return {
    key: identity.key,
    kind: identity.kind,
    title: identityTitle(identity),
    subtitle: identitySubtitle(identity),
    to: identity.to,
    closable: identityClosable(identity),
  }
}

/** The live title for a tab: for a prisoner it follows the cached record
 * (the route loads it before the tab strip ever reads it), otherwise the
 * stable default. Reads the cache only — never triggers a fetch. */
export function useTabTitle(tab: WorkspaceTab): string {
  const isPrisonerTab = tab.kind === 'prisoner'
  const recordId = isPrisonerTab ? tab.to.replace(/^\/prisoners\//, '') : null
  const { data } = useQuery({
    queryKey: isPrisonerTab ? (['prisoners', 'detail', recordId] as const) : (['__tab-title-noop__'] as const),
    enabled: isPrisonerTab,
    queryFn: async () => (recordId != null ? getPrisoner(recordId) : null),
  })
  if (isPrisonerTab && data) return prisonerFullName(data as Parameters<typeof prisonerFullName>[0])
  return tab.title
}