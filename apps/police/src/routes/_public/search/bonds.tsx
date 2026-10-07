import * as m from '@/paraglide/messages'
import { PanelButton } from '@/components/add-panel'
import { BondForm, bondPersonName, bondsOptions, bondStatusLabel, useBonds, type Bond } from '@/features/bonds'
import { RecordList } from '@/features/paper/record-list'
import { RecordPaper } from '@/features/paper/record-paper'
import { PersonIdentity } from '@/features/people'
import { format } from '@/lib/date'
import { AlarmClockIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { PaperField, SignatureLine } from '@pleadli/paper'
import { Segmented } from '@pleadli/ui/segmented'
import { createFileRoute, useNavigate } from '@tanstack/react-router'

type View = 'active' | 'all'

export const Route = createFileRoute('/_public/search/bonds')({
  validateSearch: (search: Record<string, unknown>): { open?: string; view?: View } => ({
    ...(typeof search.open === 'string' ? { open: search.open } : {}),
    ...(search.view === 'all' ? { view: 'all' as const } : {}),
  }),
  loader: async ({ context }) => {
    await context.queryClient.query({ ...bondsOptions(''), staleTime: 'static' })
  },
  component: RouteComponent,
})

/** The bond as the form the person signs (PF 18): who is released, on what
 * terms, who stands surety, and when they must report. */
function BondPaper({ bond }: { bond: Bond }) {
  const officer = [bond.officerRank, bond.officerName].filter(Boolean).join(' ')
  return (
    <RecordPaper
      entityType="bond"
      entityId={bond.id}
      reference={bond.lockUpSerialNumber ?? bond.caseReference}
      title={m["bonds_page.paper_title"]()}
      details={[
        { label: m["custody_page.person"](), value: bondPersonName(bond) },
        { label: m["bonds.granted_at"](), value: format(bond.grantedAt, 'PPp') },
        { label: m["col.status"](), value: bondStatusLabel(bond.status) },
        ...(bond.caseReference ? [{ label: m["nav.cases"](), value: bond.caseReference, copy: bond.caseReference }] : []),
        ...(bond.lockUpSerialNumber ? [{ label: m["bonds.lock_up_serial"](), value: bond.lockUpSerialNumber }] : []),
      ]}
      events={[{ at: bond.grantedAt, label: m["bonds.granted"](), by: officer || null }]}
      edit={(done) => <BondForm key={bond.id} bond={bond} onSuccess={done} />}
    >
      <PersonIdentity personId={bond.personId} />
      <section className="mb-5 flex flex-col gap-0.5">
        <PaperField label={m["bonds.granted_at"]()}>{format(bond.grantedAt, 'PPPPp')}</PaperField>
        {bond.caseReference && <PaperField label={m["nav.cases"]()}>{bond.caseReference}</PaperField>}
        {bond.lockUpSerialNumber && <PaperField label={m["bonds.lock_up_serial"]()}>{bond.lockUpSerialNumber}</PaperField>}
        <PaperField label={m["bonds_page.surety"]()}>{bond.withSurety ? [bond.suretyName, bond.suretyContact].filter(Boolean).join(', ') : m["bonds_page.own_recognisance"]()}</PaperField>
        {bond.reportingSchedule && <PaperField label={m["bonds_page.reporting"]()}>{bond.reportingSchedule}</PaperField>}
        <PaperField label={m["col.status"]()}>{bondStatusLabel(bond.status)}</PaperField>
      </section>
      {bond.notes && <p className="whitespace-pre-wrap">{bond.notes}</p>}
      <section className="mt-12 flex flex-wrap justify-between gap-8">
        <SignatureLine name={bondPersonName(bond)} caption={m["bonds_page.released_person"]()} />
        {bond.withSurety && <SignatureLine name={bond.suretyName} caption={m["bonds_page.surety"]()} />}
        <SignatureLine name={officer || null} caption={m["bonds.granting_officer"]()} />
      </section>
    </RecordPaper>
  )
}

/** Police bonds: who is out on one now, and every bond before. */
function RouteComponent() {
  const { open, view = 'active' } = Route.useSearch()
  const navigate = useNavigate()
  const { data: bonds } = useBonds('')
  const shown = view === 'active' ? bonds.filter((b) => b.status === 'active') : bonds
  const active = bonds.filter((b) => b.status === 'active').length
  const go = (next: { view?: View; open?: string | null }) => {
    const v = next.view ?? view
    const o = next.open === undefined ? open : next.open
    void navigate({ to: '/search/bonds', search: { ...(v === 'all' ? { view: v } : {}), ...(o ? { open: o } : {}) }, replace: true })
  }

  return (
    <article className="page">
      <header className="page-header">
        <div>
          <h1>{m["nav.bonds_and_sureties"]()}</h1>
          <p>{active === 1 ? m["bonds_page.active_one"]() : m["bonds_page.active_n"]({ count: active })}</p>
        </div>
        <div className="page-actions">
          <Segmented
            label={m["custody_page.view"]()}
            value={view}
            onChange={(v) => go({ view: v, open: null })}
            items={[
              { value: 'active', label: m["bonds_page.out_on_bond"]() },
              { value: 'all', label: m["custody_page.all_records"]() },
            ]}
          />
          <PanelButton label={m["bonds.submit"]()} title={m["bonds.submit"]()} description={m["bonds_page.add_desc"]()} variant="default">
            {({ close, setDirty }) => <BondForm onSuccess={close} onDirtyChange={setDirty} />}
          </PanelButton>
        </div>
      </header>

      <RecordList
        items={shown}
        date={(b) => b.grantedAt}
        label={(b) => bondPersonName(b)}
        detail={(b) => [format(b.grantedAt, 'd MMM yyyy'), b.withSurety ? b.suretyName : m["bonds_page.own_recognisance"](), b.reportingSchedule, view === 'all' ? bondStatusLabel(b.status) : null].filter(Boolean).join(' · ')}
        searchText={(b) => [bondPersonName(b), b.suretyName ?? '', b.caseReference ?? '', b.lockUpSerialNumber ?? ''].join(' ')}
        paper={(b) => <BondPaper bond={b} />}
        windowTitle={(b) => bondPersonName(b)}
        empty={view === 'active' ? m["bonds_page.none_active"]() : m["bonds_page.empty"]()}
        emptyIcon={<HugeiconsIcon icon={AlarmClockIcon} />}
        searchPlaceholder={m["bonds_page.search"]()}
        opened={open ?? null}
        onOpened={(id) => go({ open: id })}
      />
    </article>
  )
}
