import { exhibitsOptions, type Exhibit } from '@/features/evidence'
import { chargeSheetsOptions } from '@/features/legal-forms/queries'
import { chargeSheetAccusedName, type ChargeSheet } from '@/features/legal-forms/schema'
import { statementPersonName, statementsOptions, type Statement } from '@/features/statements'
import { format } from '@/lib/date'
import * as m from '@/paraglide/messages'
import { useQuery } from '@tanstack/react-query'

/** What a case file holds besides the charge: the statements taken and the exhibits recovered. A
 * charge sheet names them so the prosecutor knows what travels with the file. A referral also
 * carries the charge sheet itself (`withCharges`), because that is the first thing the prosecutor reads. */
export function useEnclosures(caseId: string | null | undefined, options: { withCharges?: boolean } = {}) {
  const statements = useQuery(statementsOptions(''))
  const exhibits = useQuery(exhibitsOptions(''))
  const charges = useQuery({ ...chargeSheetsOptions(''), enabled: !!options.withCharges })
  const ofCase = <T extends { caseId: string | null }>(rows: T[] | undefined) => (caseId ? (rows ?? []).filter((r) => r.caseId === caseId) : [])
  const s: Statement[] = ofCase(statements.data)
  const e: Exhibit[] = ofCase(exhibits.data)
  const c: ChargeSheet[] = options.withCharges ? ofCase(charges.data) : []
  const lines = [
    ...c.map((x) => m['charge_sheet.enclosed_charge']({ offence: [x.offence, chargeSheetAccusedName(x)].filter(Boolean).join(' · ') })),
    ...s.map((x) => m['charge_sheet.enclosed_statement']({ name: statementPersonName(x) ?? '·', date: format(x.givenAt, 'PPP') })),
    ...e.map((x) => m['charge_sheet.enclosed_exhibit']({ mark: x.identificationMark || '·', description: x.description })),
  ]
  return { statements: s, exhibits: e, chargeSheets: c, lines }
}
