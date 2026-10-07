import * as m from '@/paraglide/messages'
import { PanelButton } from '@/components/add-panel'
import { exhibitPersonName, exhibitsOptions, exhibitStatusLabel, ExhibitForm, useExhibits } from '@/features/evidence'
import { ExhibitPaper } from '@/features/paper/case-papers'
import { RecordList } from '@/features/paper/record-list'
import { format } from '@/lib/date'
import { FingerPrintCheckIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'

export const Route = createFileRoute('/_public/evidence/')({
  validateSearch: (search: Record<string, unknown>): { open?: string } => (typeof search.open === 'string' ? { open: search.open } : {}),
  loader: async ({ context }) => {
    await context.queryClient.query({ ...exhibitsOptions(''), staleTime: 'static' })
  },
  component: RouteComponent,
})

/** The exhibit register: every item recovered, by month, each opening as its register entry. */
function RouteComponent() {
  const { open } = Route.useSearch()
  const navigate = useNavigate()
  const { data: exhibits } = useExhibits('')

  return (
    <article className="page">
      <header className="page-header">
        <div>
          <h1>{m["nav.exhibits"]()}</h1>
          <p>{exhibits.length === 1 ? m["exhibits_page.count_one"]() : m["exhibits_page.count"]({ count: exhibits.length })}</p>
        </div>
        <div className="page-actions">
          <PanelButton label={m["exhibits_page.new"]()} title={m["exhibits_page.new"]()} description={m["evidence_page.add_desc"]()} variant="default">
            {({ close, setDirty }) => <ExhibitForm onSuccess={close} onDirtyChange={setDirty} />}
          </PanelButton>
        </div>
      </header>
      <RecordList
        items={exhibits}
        date={(e) => e.recoveredAt}
        label={(e) => e.description}
        detail={(e) => [e.identificationMark, e.caseReference, exhibitStatusLabel(e.status), e.storageLocation].filter(Boolean).join(' · ')}
        value={(e) => <span className="text-xs">{format(e.recoveredAt, 'd MMM')}</span>}
        searchText={(e) => [e.description, e.identificationMark ?? '', e.caseReference ?? '', e.storageLocation ?? '', exhibitPersonName(e) ?? ''].join(' ')}
        paper={(e) => <ExhibitPaper exhibit={e} />}
        windowTitle={(e) => e.identificationMark || e.description}
        empty={m["evidence_page.empty"]()}
        emptyIcon={<HugeiconsIcon icon={FingerPrintCheckIcon} />}
        searchPlaceholder={m["evidence_page.search"]()}
        opened={open ?? null}
        onOpened={(id) => void navigate({ to: '/evidence', search: id ? { open: id } : {}, replace: true })}
      />
    </article>
  )
}
