import * as m from '@/paraglide/messages'
import { PrintableRow, PrintableSection } from '@/components/printable-list'
import { usePrintOnMount } from '@/hooks/use-print-on-mount'
import { bondPersonName, bondStatusLabel } from '@/features/bonds/schema'
import { caseRoleLabel, caseStatusLabel, casePersonName, caseWorkspaceOptions, useCaseWorkspace } from '@/features/cases'
import { custodyPersonName, custodyStatusLabel } from '@/features/custody/schema'
import { exhibitStatusLabel } from '@/features/evidence/schema'
import { chargeSheetAccusedName } from '@/features/legal-forms/schema'
import { referralDestinationTypeLabel, referralStatusLabel } from '@/features/referrals/schema'
import { statementPersonName } from '@/features/statements/schema'
import { createFileRoute, notFound } from '@tanstack/react-router'
import { format } from '@/lib/date'

export const Route = createFileRoute('/print/investigations/$caseId')({
  loader: async ({ context, params }) => {
    const workspace = await context.queryClient.query({
      ...caseWorkspaceOptions(params.caseId),
      staleTime: 'static',
    })
    if (!workspace) throw notFound()
  },
  component: RouteComponent,
})

function RouteComponent() {
  const { caseId } = Route.useParams()
  const { data: workspace } = useCaseWorkspace(caseId)
  usePrintOnMount()

  if (!workspace) return null
  const { case: kase, people, statements, custodyRecords, bonds, exhibits, chargeSheets, referrals } = workspace

  return (
    <article className="mx-auto max-w-2xl p-8 text-sm text-foreground">
      <button type="button" onClick={() => window.history.back()} className="mb-4 text-xs text-muted-foreground print:hidden">
        {m["print.back"]()}
      </button>

      <h1 className="text-lg font-semibold">{kase.reference}</h1>
      <p className="text-xs text-muted-foreground">
        {m["print.case_file"]({ status: caseStatusLabel(kase.status), date: format(Date.now(), 'PPP p') })}
      </p>
      <p className="mt-3 mb-6 text-sm">{kase.summary}</p>

      <div className="flex flex-col gap-4">
        <PrintableSection title={m["cases.people_involved"]()} count={people.length}>
          {people.map((p) => (
            <div key={p.id} className="flex items-center justify-between gap-3 border-b border-border/20 py-1 text-xs">
              <span>{casePersonName(p)}</span>
              <span className="text-muted-foreground">{caseRoleLabel(p.role)}</span>
            </div>
          ))}
        </PrintableSection>

        <PrintableSection title={m["nav.statements"]()} count={statements.length}>
          {statements.map((s) => (
            <PrintableRow key={s.id} title={statementPersonName(s)} subtitle={s.officerName ? m["investigation.taken_by"]({ name: s.officerName }) : undefined} at={s.givenAt} />
          ))}
        </PrintableSection>

        <PrintableSection title={m["custody_page.table"]()} count={custodyRecords.length}>
          {custodyRecords.map((r) => (
            <PrintableRow key={r.id} title={custodyPersonName(r)} subtitle={custodyStatusLabel(r.status)} at={r.arrestedAt} />
          ))}
        </PrintableSection>

        <PrintableSection title={m["investigation.bonds_sureties"]()} count={bonds.length}>
          {bonds.map((b) => (
            <PrintableRow key={b.id} title={bondPersonName(b)} subtitle={bondStatusLabel(b.status)} at={b.grantedAt} />
          ))}
        </PrintableSection>

        <PrintableSection title={m["investigation.evidence"]()} count={exhibits.length}>
          {exhibits.map((x) => (
            <PrintableRow key={x.id} title={x.description} subtitle={exhibitStatusLabel(x.status)} at={x.recoveredAt} />
          ))}
        </PrintableSection>

        <PrintableSection title={m["investigation.charge_sheets"]()} count={chargeSheets.length}>
          {chargeSheets.map((cs) => (
            <PrintableRow key={cs.id} title={cs.offence} subtitle={chargeSheetAccusedName(cs) ?? undefined} at={cs.chargedAt} />
          ))}
        </PrintableSection>

        <PrintableSection title={m["common.referrals"]()} count={referrals.length}>
          {referrals.map((r) => (
            <PrintableRow
              key={r.id}
              title={r.destinationName || referralDestinationTypeLabel(r.destinationType)}
              subtitle={referralStatusLabel(r.status)}
              at={r.referredAt}
            />
          ))}
        </PrintableSection>
      </div>
    </article>
  )
}
