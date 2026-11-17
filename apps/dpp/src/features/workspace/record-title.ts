import { documentOptions } from '@/features/documents/queries'
import { prosecutionFileOptions } from '@/features/prosecution-files/queries'
import type { TabIdentity } from '@pleadli/shell'
import { useQuery } from '@tanstack/react-query'

/** An open file's or document's own name once the record has loaded. Reads the
 * cache only (the record's own route loads it), so a tab you are not looking
 * at never costs a request. */
export function useRecordTitle(identity: TabIdentity | null): string | undefined {
  const [kind, recordId = ''] = identity?.key.split(':') ?? []
  const { data: file } = useQuery({ ...prosecutionFileOptions(kind === 'file' ? recordId : ''), enabled: false })
  const { data: doc } = useQuery({ ...documentOptions(kind === 'document' ? recordId : ''), enabled: false })
  if (kind === 'file' && file) return file.title
  if (kind === 'document' && doc) return doc.reference ?? doc.title
  return undefined
}
