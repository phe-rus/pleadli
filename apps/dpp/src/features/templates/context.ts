import { chargesForFileOptions } from '@/features/charges'
import { custodyOptions } from '@/features/custody/queries'
import { decisionsForFileOptions, decisionTypeLabel } from '@/features/decisions'
import { directionsForFileOptions } from '@/features/directions'
import { fileItemsOptions } from '@/features/file-index/queries'
import { evidenceCategoryLabel, evidenceForFileOptions } from '@/features/evidence'
import { statementsForFileOptions } from '@/features/statements/queries'
import { statementRoleLabel } from '@/features/statements/schema'
import { safeParseRichTextDoc } from '@pleadli/rich-text'
import { brandOptions, installationOptions } from '@/features/installation'
import { filePeopleOptions, type personFullNameForRole, prosecutionFileOptions } from '@/features/prosecution-files'
import { securityStatusOptions } from '@/features/security'
import { activeJurisdiction } from '@/lib/jurisdiction'
import { prosecutionNames } from '@pleadli/setup'
import type { QueryClient } from '@tanstack/react-query'
import type { TemplateContext } from './types'

/** Reads everything a template needs for one file, from the same queries the
 * screens use (fetched if not yet held). */
export async function templateContext(queryClient: QueryClient, fileId: string, decisionId?: string | null): Promise<TemplateContext> {
  const [file, people, charges, decisions, directions, custody, items, install, status, statements, evidence] = await Promise.all([
    queryClient.fetchQuery(prosecutionFileOptions(fileId)),
    queryClient.fetchQuery(filePeopleOptions(fileId)),
    queryClient.fetchQuery(chargesForFileOptions(fileId)),
    queryClient.fetchQuery(decisionsForFileOptions(fileId)),
    queryClient.fetchQuery(directionsForFileOptions(fileId)),
    queryClient.fetchQuery(custodyOptions(fileId)),
    queryClient.fetchQuery(fileItemsOptions(fileId)),
    queryClient.fetchQuery(installationOptions()),
    queryClient.fetchQuery(securityStatusOptions()),
    queryClient.fetchQuery(statementsForFileOptions(fileId)),
    queryClient.fetchQuery(evidenceForFileOptions(fileId)),
  ])
  await queryClient.fetchQuery(brandOptions())
  if (!file) throw new Error('File not found')
  const country = activeJurisdiction()
  // On a court paper a person is written surname first, without a comma: KIBUUKA JOSEPH.
  const paperName = (p: Parameters<typeof personFullNameForRole>[0]) => [p.personLastName, p.personFirstName, p.personOtherNames].filter(Boolean).join(' ')
  const byRole = (role: string) => people.filter((p) => p.role === role).map(paperName)
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
    charges: charges.map((c) => ({ offence: c.offence, section: c.statutorySection, particulars: plain(c.particulars) || null, accused: accusedName(c.accusedPersonId) ? paperName(accusedName(c.accusedPersonId)!) : null })),
    decision: decision ? { id: decision.id, kind: decision.decisionType, label: decisionTypeLabel(decision.decisionType), reasons: decision.reasons, decidedAt: decision.decidedAt } : null,
    directions: directions.filter((d) => !decision || d.decisionId === decision.id).map((d) => ({ kind: d.kind, instruction: d.instruction })),
    custody,
    exhibits: items.filter((i) => i.kind === 'exhibit').map((i) => i.title),
    statements: [...statements]
      .sort((a, b) => Number(a.statementRole === 'investigating_officer') - Number(b.statementRole === 'investigating_officer') || a.givenAt - b.givenAt)
      .map((st) => ({ name: [st.personLastName, st.personFirstName, st.personOtherNames].filter(Boolean).join(' '), role: statementRoleLabel(st.statementRole), madeOn: st.givenAt, text: plain(st.content) })),
    evidence: evidence.map((e) => ({ mark: e.identificationMark, kind: evidenceCategoryLabel(e.category), description: plain(e.description) })),
    signer: { name: status?.actor?.name ?? '', rank: status?.actor?.rank ?? null },
    today: Date.now(),
  }
}

/** The words of a rich-text field, paragraph by paragraph, as plain text for a document. */
function plain(value: string | null): string {
  if (!value) return ''
  const doc = safeParseRichTextDoc(value) as { content?: { content?: { text?: string }[] }[] }
  return (doc.content ?? [])
    .map((block) => (block.content ?? []).map((node) => node.text ?? '').join(''))
    .filter((line) => line.trim())
    .join('\n\n')
}
