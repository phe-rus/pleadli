import { exhibitsOptions, type Exhibit } from '@/features/evidence'
import { statementPersonName, statementsOptions, type Statement } from '@/features/statements'
import { format } from '@/lib/date'
import * as m from '@/paraglide/messages'
import { useQuery } from '@tanstack/react-query'

/** What a case file holds besides the charge: the statements taken and the exhibits recovered. A
 * charge sheet and a referral name them so the prosecutor knows what travels with the file. */
export function useEnclosures(caseId: string | null | undefined) {
  const statements = useQuery(statementsOptions(''))
  const exhibits = useQuery(exhibitsOptions(''))
  const ofCase = <T extends { caseId: string | null }>(rows: T[] | undefined) => (caseId ? (rows ?? []).filter((r) => r.caseId === caseId) : [])
  const s: Statement[] = ofCase(statements.data)
  const e: Exhibit[] = ofCase(exhibits.data)
  const lines = [
    ...s.map((x) => m['charge_sheet.enclosed_statement']({ name: statementPersonName(x) ?? '·', date: format(x.givenAt, 'PPP') })),
    ...e.map((x) => m['charge_sheet.enclosed_exhibit']({ mark: x.identificationMark || '·', description: x.description })),
  ]
  return { statements: s, exhibits: e, lines }
}
