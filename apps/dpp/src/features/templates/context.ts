import { chargesForFileOptions } from '@/features/charges'
import { custodyOptions } from '@/features/custody/queries'
import { decisionsForFileOptions, decisionTypeLabel } from '@/features/decisions'
import { directionsForFileOptions } from '@/features/directions'
import { fileItemsOptions } from '@/features/file-index/queries'
import { brandOptions, installationOptions } from '@/features/installation'
import { filePeopleOptions, personFullNameForRole, prosecutionFileOptions } from '@/features/prosecution-files'
import { securityStatusOptions } from '@/features/security'
import { activeJurisdiction } from '@/lib/jurisdiction'
import { prosecutionNames } from '@pleadli/setup'
import type { QueryClient } from '@tanstack/react-query'
import type { TemplateContext } from './types'

/** Reads everything a template needs for one file, from the same queries the
 * screens use (fetched if not yet held). */
export async function templateContext(queryClient: QueryClient, fileId: string, decisionId?: string | null): Promise<TemplateContext> {
  const [file, people, charges, decisions, directions, custody, items, install, status] = await Promise.all([
    queryClient.fetchQuery(prosecutionFileOptions(fileId)),
    queryClient.fetchQuery(filePeopleOptions(fileId)),
    queryClient.fetchQuery(chargesForFileOptions(fileId)),
    queryClient.fetchQuery(decisionsForFileOptions(fileId)),
    queryClient.fetchQuery(directionsForFileOptions(fileId)),
    queryClient.fetchQuery(custodyOptions(fileId)),
    queryClient.fetchQuery(fileItemsOptions(fileId)),
    queryClient.fetchQuery(installationOptions()),
    queryClient.fetchQuery(securityStatusOptions()),
  ])
  await queryClient.fetchQuery(brandOptions())
  if (!file) throw new Error('File not found')
  const country = activeJurisdiction()
  const byRole = (role: string) => people.filter((p) => p.role === role).map(personFullNameForRole)
  const decision = (decisionId ? decisions.find((d) => d.id === decisionId) : [...decisions].sort((a, b) => b.decidedAt - a.decidedAt)[0]) ?? null
  const accusedName = (id: string | null) => (id ? people.find((p) => p.personId === id) : undefined)
  return {
    country,
    names: prosecutionNames(country),
    office: { name: install?.officeName ?? '', region: install?.region ?? null },
    file,
    accused: byRole('accused'),
    complainants: byRole('complainant'),
    witnesses: byRole('witness'),
    charges: charges.map((c) => ({ offence: c.offence, section: c.statutorySection, particulars: c.particulars, accused: accusedName(c.accusedPersonId) ? personFullNameForRole(accusedName(c.accusedPersonId)!) : null })),
    decision: decision ? { id: decision.id, kind: decision.decisionType, label: decisionTypeLabel(decision.decisionType), reasons: decision.reasons, decidedAt: decision.decidedAt } : null,
    directions: directions.filter((d) => !decision || d.decisionId === decision.id).map((d) => ({ kind: d.kind, instruction: d.instruction })),
    custody,
    exhibits: items.filter((i) => i.kind === 'exhibit').map((i) => i.title),
    signer: { name: status?.actor?.name ?? '', rank: status?.actor?.rank ?? null },
    today: Date.now(),
  }
}
