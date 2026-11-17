import { caseOptions } from '@/features/cases/queries'
import { libraryItemOptions } from '@/features/library/queries'
import { orderOptions } from '@/features/orders/queries'
import { rulingOptions } from '@/features/rulings/queries'
import { sittingOptions } from '@/features/sitting-record/queries'
import type { TabIdentity } from '@pleadli/shell'
import { useQuery } from '@tanstack/react-query'

/** An open record's own name once it has loaded. Reads the cache only (the
 * record's own route loads it), so a tab you are not looking at never costs a request. */
export function useRecordTitle(identity: TabIdentity | null): string | undefined {
  const [kind, id = ''] = identity?.key.split(':') ?? []
  const idFor = (want: string) => (kind === want ? id : '')
  const { data: detail } = useQuery({ ...caseOptions(idFor('case')), enabled: false })
  const { data: order } = useQuery({ ...orderOptions(idFor('order')), enabled: false })
  const { data: sitting } = useQuery({ ...sittingOptions(idFor('sitting')), enabled: false })
  const { data: ruling } = useQuery({ ...rulingOptions(idFor('ruling')), enabled: false })
  const { data: text } = useQuery({ ...libraryItemOptions(idFor('reference')), enabled: false })

  if (kind === 'case' && detail) return detail.case.courtNumber
  if (kind === 'order' && order) return order.reference ?? order.title
  if (kind === 'sitting' && sitting) return `${sitting.case.courtNumber} sitting`
  if (kind === 'ruling' && ruling) return ruling.reference ?? ruling.title
  if (kind === 'reference' && text) return text.title
  return undefined
}
