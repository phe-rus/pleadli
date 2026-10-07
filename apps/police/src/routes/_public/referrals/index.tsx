import * as m from '@/paraglide/messages'
import { PanelButton } from '@/components/add-panel'
import { RecordList } from '@/features/paper/record-list'
import { RecordPaper } from '@/features/paper/record-paper'
import { ReferralForm, referralDestinationTypeLabel, referralsOptions, referralStatusLabel, useReferrals, type Referral } from '@/features/referrals'
import { format } from '@/lib/date'
import { Share08Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { PaperField, SignatureLine } from '@pleadli/paper'
import { Segmented } from '@pleadli/ui/segmented'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'

type View = 'waiting' | 'all'

export const Route = createFileRoute('/_public/referrals/')({
  validateSearch: (search: Record<string, unknown>): { open?: string; view?: View } => ({
    ...(typeof search.open === 'string' ? { open: search.open } : {}),
    ...(search.view === 'all' ? { view: 'all' as const } : {}),
  }),
  loader: async ({ context }) => {
    await context.queryClient.query({ ...referralsOptions(''), staleTime: 'static' })
  },
  component: RouteComponent,
})

const destination = (r: Referral) => r.destinationName || referralDestinationTypeLabel(r.destinationType)

/** The covering letter a case file leaves the station with. */
function ReferralPaper({ referral }: { referral: Referral }) {
  return (
    <RecordPaper
      entityType="referral"
      entityId={referral.id}
      reference={referral.caseReference}
      title={m["referrals_page.paper_title"]()}
      details={[
        { label: m["nav.cases"](), value: referral.caseReference, copy: referral.caseReference },
        { label: m["referrals_page.to"](), value: destination(referral) },
        { label: m["referrals.referred_at"](), value: format(referral.referredAt, 'PPp') },
        { label: m["col.status"](), value: referralStatusLabel(referral.status) },
      ]}
      events={[{ at: referral.referredAt, label: m["referrals_page.sent"](), by: referral.officerName }]}
      edit={(done) => <ReferralForm key={referral.id} referral={referral} onSuccess={done} />}
    >
      <section className="mb-5 flex flex-col gap-0.5">
        <PaperField label={m["referrals_page.to"]()}>{`${destination(referral)} (${referralDestinationTypeLabel(referral.destinationType)})`}</PaperField>
        <PaperField label={m["nav.cases"]()}>{referral.caseReference}</PaperField>
        <PaperField label={m["referrals.referred_at"]()}>{format(referral.referredAt, 'PPPP')}</PaperField>
        <PaperField label={m["col.status"]()}>{referralStatusLabel(referral.status)}</PaperField>
      </section>
      <p>{(referral.destinationType === 'dpp' ? m["referrals_page.covering"] : m["referrals_page.covering_plain"])({ reference: referral.caseReference, destination: destination(referral) })}</p>
      {referral.notes && <p className="whitespace-pre-wrap">{referral.notes}</p>}
      <section className="mt-12 flex justify-end">
        <SignatureLine name={referral.officerName} caption={m["referrals.referring_officer"]()} />
      </section>
    </RecordPaper>
  )
}

/** Case files sent out of the station: what still waits for a reply, and every referral before. */
function RouteComponent() {
  const { open, view = 'waiting' } = Route.useSearch()
  const navigate = useNavigate()
  const { data: referrals } = useReferrals('')
  const waiting = referrals.filter((r) => r.status === 'pending')
  const go = (next: { view?: View; open?: string | null }) => {
    const v = next.view ?? view
    const o = next.open === undefined ? open : next.open
    void navigate({ to: '/referrals', search: { ...(v === 'all' ? { view: v } : {}), ...(o ? { open: o } : {}) }, replace: true })
  }

  return (
    <article className="page">
      <header className="page-header">
        <div>
          <h1>{m["nav.referrals"]()}</h1>
          <p>{waiting.length === 1 ? m["referrals_page.waiting_one"]() : m["referrals_page.waiting_n"]({ count: waiting.length })}</p>
        </div>
        <div className="page-actions">
          <Segmented
            label={m["custody_page.view"]()}
            value={view}
            onChange={(v) => go({ view: v, open: null })}
            items={[
              { value: 'waiting', label: m["today.waiting_reply"]() },
              { value: 'all', label: m["custody_page.all_records"]() },
            ]}
          />
          <PanelButton label={m["referrals.submit"]()} title={m["referrals.submit"]()} description={m["referrals_page.add_desc"]()} variant="default">
            {({ close, setDirty }) => <ReferralForm onSuccess={close} onDirtyChange={setDirty} />}
          </PanelButton>
        </div>
      </header>

      <RecordList
        items={view === 'waiting' ? waiting : referrals}
        date={(r) => r.referredAt}
        label={(r) => r.caseReference}
        detail={(r) => [m["referrals_page.to_x"]({ destination: destination(r) }), format(r.referredAt, 'd MMM yyyy'), view === 'all' ? referralStatusLabel(r.status) : null].filter(Boolean).join(' · ')}
        value={(r) => (
          <Link to="/investigations/$caseId" params={{ caseId: r.caseId }} onClick={(event) => event.stopPropagation()} className="text-[0.8125rem]">
            {m["referrals_page.open_case"]()}
          </Link>
        )}
        searchText={(r) => [r.caseReference, destination(r), r.officerName ?? ''].join(' ')}
        paper={(r) => <ReferralPaper referral={r} />}
        windowTitle={(r) => r.caseReference}
        empty={view === 'waiting' ? m["referrals_page.none_waiting"]() : m["referrals_page.empty"]()}
        emptyIcon={<HugeiconsIcon icon={Share08Icon} />}
        searchPlaceholder={m["referrals_page.search"]()}
        opened={open ?? null}
        onOpened={(id) => go({ open: id })}
      />
    </article>
  )
}
