import { caseWorkspaceOptions } from '@/features/cases/queries'
import { chargeSheetAccusedName } from '@/features/legal-forms/schema'
import { chargeSheetsOptions } from '@/features/legal-forms/queries'
import { personProfileOptions } from '@/features/people/queries'
import type { TabIdentity } from '@pleadli/shell'
import { useQuery } from '@tanstack/react-query'

/** An open record's own name once it has loaded: a case's reference, a person's
 * name, a charge sheet's accused. Reads the cache only (the record's own route
 * loads it), so a tab you are not looking at never costs a request. */
export function useRecordTitle(identity: TabIdentity | null): string | undefined {
  const [kind, recordId = ''] = identity?.key.split(':') ?? []
  const { data: workspace } = useQuery({ ...caseWorkspaceOptions(recordId), enabled: false })
  const { data: profile } = useQuery({ ...personProfileOptions(recordId), enabled: false })
  const { data: sheets } = useQuery({ ...chargeSheetsOptions(''), enabled: false })

  if (kind === 'case' && workspace) return workspace.case.reference
  if (kind === 'person' && profile) return [profile.person.firstName, profile.person.lastName].filter(Boolean).join(' ')
  if (kind === 'chargesheet' && sheets) {
    const sheet = sheets.find((s) => s.id === recordId)
    if (sheet) return chargeSheetAccusedName(sheet) ?? sheet.caseReference
  }
  return undefined
}
