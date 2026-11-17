import { prisonerFullName, prisonerOptions } from '@/features/prisoners'
import type { TabIdentity } from '@pleadli/shell'
import { useQuery } from '@tanstack/react-query'

/** The open prisoner's tab takes the person's name once the record has loaded.
 * Reads the cache only (the file's own route loads the record), so a tab you
 * are not looking at never costs a request. */
export function useRecordTitle(identity: TabIdentity | null): string | undefined {
  const [kind, id = ''] = identity?.key.split(':') ?? []
  const { data: prisoner } = useQuery({ ...prisonerOptions(kind === 'prisoner' ? id : ''), enabled: false })
  return kind === 'prisoner' && prisoner ? prisonerFullName(prisoner) : undefined
}
