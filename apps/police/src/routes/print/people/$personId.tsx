import { PrintableField, PrintableRow, PrintableSection } from '@/components/printable-list'
import { usePrintOnMount } from '@/hooks/use-print-on-mount'
import { personFullName, personProfileOptions, usePersonProfile } from '@/features/people'
import { createFileRoute, notFound } from '@tanstack/react-router'
import { format } from 'date-fns/format'

export const Route = createFileRoute('/print/people/$personId')({
  loader: async ({ context, params }) => {
    const profile = await context.queryClient.query({
      ...personProfileOptions(params.personId),
      staleTime: 'static',
    })
    if (!profile) throw notFound()
  },
  component: RouteComponent,
})

function RouteComponent() {
  const { personId } = Route.useParams()
  const { data: profile } = usePersonProfile(personId)
  usePrintOnMount()

  if (!profile) return null
  const { person, cases, incidents, statements, custodyRecords, bonds, stationDiaryEntries, exhibits, chargeSheets, vehicles } =
    profile

  return (
    <article className="mx-auto max-w-2xl p-8 text-sm text-foreground">
      <button type="button" onClick={() => window.history.back()} className="mb-4 text-xs text-muted-foreground print:hidden">
        ← Back
      </button>

      <h1 className="text-lg font-semibold">{personFullName(person)}</h1>
      <p className="mb-6 text-xs text-muted-foreground">Person record. Printed {format(Date.now(), 'PPP p')}.</p>

      <div className="mb-6">
        <PrintableField label="Other names" value={person.otherNames ?? '·'} />
        <PrintableField label="Phone" value={person.phone ?? '·'} />
        <PrintableField label="National ID" value={person.nationalId ?? '·'} />
        <PrintableField label="Address" value={person.address ?? '·'} />
        <PrintableField label="Recorded" value={format(person.createdAt, 'PPP')} />
      </div>

      <div className="flex flex-col gap-4">
        <PrintableSection title="Cases" count={cases.length}>
          {cases.map((c) => (
            <PrintableRow key={c.id} title={c.reference} subtitle={c.summary} at={c.createdAt} />
          ))}
        </PrintableSection>

        <PrintableSection title="Incidents" count={incidents.length}>
          {incidents.map((i) => (
            <PrintableRow key={i.id} title={i.summary} subtitle={i.location ?? undefined} at={i.occurredAt} />
          ))}
        </PrintableSection>

        <PrintableSection title="Statements" count={statements.length}>
          {statements.map((s) => (
            <PrintableRow key={s.id} title={s.officerName ? `Taken by ${s.officerName}` : 'Statement'} at={s.givenAt} />
          ))}
        </PrintableSection>

        <PrintableSection title="Custody records" count={custodyRecords.length}>
          {custodyRecords.map((r) => (
            <PrintableRow key={r.id} title={r.status.replace(/_/g, ' ')} subtitle={r.location ?? undefined} at={r.arrestedAt} />
          ))}
        </PrintableSection>

        <PrintableSection title="Bonds" count={bonds.length}>
          {bonds.map((b) => (
            <PrintableRow key={b.id} title={b.status} subtitle={b.withSurety ? (b.suretyName ?? 'With surety') : 'No surety'} at={b.grantedAt} />
          ))}
        </PrintableSection>

        <PrintableSection title="Station diary entries" count={stationDiaryEntries.length}>
          {stationDiaryEntries.map((e) => (
            <PrintableRow key={e.id} title={e.category.replace(/_/g, ' ')} at={e.createdAt} />
          ))}
        </PrintableSection>

        <PrintableSection title="Evidence" count={exhibits.length}>
          {exhibits.map((x) => (
            <PrintableRow key={x.id} title={x.description} subtitle={x.status} at={x.recoveredAt} />
          ))}
        </PrintableSection>

        <PrintableSection title="Charge sheets" count={chargeSheets.length}>
          {chargeSheets.map((cs) => (
            <PrintableRow key={cs.id} title={cs.offence} subtitle={cs.caseReference} at={cs.chargedAt} />
          ))}
        </PrintableSection>

        <PrintableSection title="Vehicles" count={vehicles.length}>
          {vehicles.map((v) => (
            <PrintableRow
              key={v.id}
              title={v.plateNumber}
              subtitle={[v.make, v.model].filter(Boolean).join(' ') || undefined}
              at={v.createdAt}
            />
          ))}
        </PrintableSection>
      </div>
    </article>
  )
}
