import * as m from '@/paraglide/messages'
import { PanelButton } from '@/components/add-panel'
import { RecordList } from '@/features/paper/record-list'
import { destination, ReferralForm, ReferralPaper, referralsOptions, referralStatusLabel, useReferrals } from '@/features/referrals'
import { format } from '@/lib/date'
import { Share08Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
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
