import { documentOptions } from '@/features/documents/queries'
import { matterOptions } from '@/features/matters/queries'
import type { TabIdentity } from '@pleadli/shell'
import { useQuery } from '@tanstack/react-query'

/** An open matter's or document's own name once the record has loaded. Reads
 * the cache only (the record's own route loads it), so a tab you are not
 * looking at never costs a request. */
export function useRecordTitle(identity: TabIdentity | null): string | undefined {
  const [kind, id = ''] = identity?.key.split(':') ?? []
  const { data: detail } = useQuery({ ...matterOptions(kind === 'matter' ? id : ''), enabled: false })
  const { data: documentRecord } = useQuery({ ...documentOptions(kind === 'document' ? id : ''), enabled: false })
  if (kind === 'matter' && detail) return detail.matter.courtNumber ?? detail.matter.title
  if (kind === 'document' && documentRecord) return documentRecord.reference ?? documentRecord.title
  return undefined
}
