import * as m from '@/paraglide/messages'
import { PrintableField, PrintableRow, PrintableSection } from '@/components/printable-list'
import { usePrintOnMount } from '@/hooks/use-print-on-mount'
import { bondStatusLabel } from '@/features/bonds/schema'
import { custodyStatusLabel } from '@/features/custody/schema'
import { exhibitStatusLabel } from '@/features/evidence/schema'
import { stationDiaryCategoryLabel } from '@/features/station-diary/schema'
import { personFullName, personProfileOptions, usePersonProfile } from '@/features/people'
import { createFileRoute, notFound } from '@tanstack/react-router'
import { format } from '@/lib/date'

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
        {m["print.back"]()}
      </button>

      <h1 className="text-lg font-semibold">{personFullName(person)}</h1>
      <p className="mb-6 text-xs text-muted-foreground">{m["print.person_record"]({ date: format(Date.now(), 'PPP p') })}</p>

      <div className="mb-6">
        <PrintableField label={m["people.other_names"]()} value={person.otherNames ?? '·'} />
        <PrintableField label={m["col.phone"]()} value={person.phone ?? '·'} />
        <PrintableField label={m["print.national_id"]()} value={person.nationalId ?? '·'} />
        <PrintableField label={m["people.address"]()} value={person.address ?? '·'} />
        <PrintableField label={m["print.recorded"]()} value={format(person.createdAt, 'PPP')} />
      </div>

      <div className="flex flex-col gap-4">
        <PrintableSection title={m["people_page.cases"]()} count={cases.length}>
          {cases.map((c) => (
            <PrintableRow key={c.id} title={c.reference} subtitle={c.summary} at={c.createdAt} />
          ))}
        </PrintableSection>

        <PrintableSection title={m["nav.incidents"]()} count={incidents.length}>
          {incidents.map((i) => (
            <PrintableRow key={i.id} title={i.summary} subtitle={i.location ?? undefined} at={i.occurredAt} />
          ))}
        </PrintableSection>

        <PrintableSection title={m["nav.statements"]()} count={statements.length}>
          {statements.map((s) => (
            <PrintableRow key={s.id} title={s.officerName ? m["investigation.taken_by"]({ name: s.officerName }) : m["print.statement"]()} at={s.givenAt} />
          ))}
        </PrintableSection>

        <PrintableSection title={m["custody_page.table"]()} count={custodyRecords.length}>
          {custodyRecords.map((r) => (
            <PrintableRow key={r.id} title={custodyStatusLabel(r.status)} subtitle={r.location ?? undefined} at={r.arrestedAt} />
          ))}
        </PrintableSection>

        <PrintableSection title={m["print.bonds"]()} count={bonds.length}>
          {bonds.map((b) => (
            <PrintableRow key={b.id} title={bondStatusLabel(b.status)} subtitle={b.withSurety ? (b.suretyName ?? m["people_page.with_surety"]()) : m["people_page.no_surety"]()} at={b.grantedAt} />
          ))}
        </PrintableSection>

        <PrintableSection title={m["print.diary_entries"]()} count={stationDiaryEntries.length}>
          {stationDiaryEntries.map((e) => (
            <PrintableRow key={e.id} title={stationDiaryCategoryLabel(e.category)} at={e.createdAt} />
          ))}
        </PrintableSection>

        <PrintableSection title={m["investigation.evidence"]()} count={exhibits.length}>
          {exhibits.map((x) => (
            <PrintableRow key={x.id} title={x.description} subtitle={exhibitStatusLabel(x.status)} at={x.recoveredAt} />
          ))}
        </PrintableSection>

        <PrintableSection title={m["investigation.charge_sheets"]()} count={chargeSheets.length}>
          {chargeSheets.map((cs) => (
            <PrintableRow key={cs.id} title={cs.offence} subtitle={cs.caseReference} at={cs.chargedAt} />
          ))}
        </PrintableSection>

        <PrintableSection title={m["people_page.vehicles"]()} count={vehicles.length}>
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
