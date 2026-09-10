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
import { format } from 'date-fns/format'

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
        ← Back
      </button>

      <h1 className="text-lg font-semibold">{kase.reference}</h1>
      <p className="text-xs text-muted-foreground">
        {caseStatusLabel(kase.status)}. Case file. Printed {format(Date.now(), 'PPP p')}.
      </p>
      <p className="mt-3 mb-6 text-sm">{kase.summary}</p>

      <div className="flex flex-col gap-4">
        <PrintableSection title="People involved" count={people.length}>
          {people.map((p) => (
            <div key={p.id} className="flex items-center justify-between gap-3 border-b border-border/20 py-1 text-xs">
              <span>{casePersonName(p)}</span>
              <span className="text-muted-foreground">{caseRoleLabel(p.role)}</span>
            </div>
          ))}
        </PrintableSection>

        <PrintableSection title="Statements" count={statements.length}>
          {statements.map((s) => (
            <PrintableRow key={s.id} title={statementPersonName(s)} subtitle={s.officerName ? `Taken by ${s.officerName}` : undefined} at={s.givenAt} />
          ))}
        </PrintableSection>

        <PrintableSection title="Custody records" count={custodyRecords.length}>
          {custodyRecords.map((r) => (
            <PrintableRow key={r.id} title={custodyPersonName(r)} subtitle={custodyStatusLabel(r.status)} at={r.arrestedAt} />
          ))}
        </PrintableSection>

        <PrintableSection title="Bonds & sureties" count={bonds.length}>
          {bonds.map((b) => (
            <PrintableRow key={b.id} title={bondPersonName(b)} subtitle={bondStatusLabel(b.status)} at={b.grantedAt} />
          ))}
        </PrintableSection>

        <PrintableSection title="Evidence" count={exhibits.length}>
          {exhibits.map((x) => (
            <PrintableRow key={x.id} title={x.description} subtitle={exhibitStatusLabel(x.status)} at={x.recoveredAt} />
          ))}
        </PrintableSection>

        <PrintableSection title="Charge sheets" count={chargeSheets.length}>
          {chargeSheets.map((cs) => (
            <PrintableRow key={cs.id} title={cs.offence} subtitle={chargeSheetAccusedName(cs) ?? undefined} at={cs.chargedAt} />
          ))}
        </PrintableSection>

        <PrintableSection title="Referrals" count={referrals.length}>
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
