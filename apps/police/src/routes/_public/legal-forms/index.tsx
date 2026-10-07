import * as m from '@/paraglide/messages'
import { PanelButton } from '@/components/add-panel'
import { ChargeSheetForm, chargeSheetAccusedName, chargeSheetsOptions, useChargeSheets } from '@/features/legal-forms'
import { ChargeSheetPaper } from '@/features/paper/case-papers'
import { RecordList } from '@/features/paper/record-list'
import { format } from '@/lib/date'
import { File02Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'

export const Route = createFileRoute('/_public/legal-forms/')({
  validateSearch: (search: Record<string, unknown>): { open?: string } => (typeof search.open === 'string' ? { open: search.open } : {}),
  loader: async ({ context }) => {
    await context.queryClient.query({ ...chargeSheetsOptions(''), staleTime: 'static' })
  },
  component: RouteComponent,
})

/** Charge sheets the station has drawn up, by month; each opens as the sheet that goes to court. */
function RouteComponent() {
  const { open } = Route.useSearch()
  const navigate = useNavigate()
  const { data: sheets } = useChargeSheets('')

  return (
    <article className="page">
      <header className="page-header">
        <div>
          <h1>{m["nav.charge_sheets"]()}</h1>
          <p>{sheets.length === 1 ? m["legal_page.count_one"]() : m["legal_page.count"]({ count: sheets.length })}</p>
        </div>
        <div className="page-actions">
          <PanelButton label={m["legal_page.new"]()} title={m["legal_page.new"]()} description={m["legal_page.add_desc"]()} variant="default">
            {({ close, setDirty }) => <ChargeSheetForm onSuccess={close} onDirtyChange={setDirty} />}
          </PanelButton>
        </div>
      </header>
      <RecordList
        items={sheets}
        date={(c) => c.chargedAt}
        label={(c) => c.offence}
        detail={(c) => [chargeSheetAccusedName(c), c.caseReference, c.statutorySection].filter(Boolean).join(' · ')}
        value={(c) => <span className="text-xs">{format(c.chargedAt, 'd MMM')}</span>}
        searchText={(c) => [c.offence, c.caseReference, chargeSheetAccusedName(c) ?? '', c.statutorySection].join(' ')}
        paper={(c) => <ChargeSheetPaper chargeSheet={c} />}
        windowTitle={(c) => c.offence}
        empty={m["legal_page.empty"]()}
        emptyIcon={<HugeiconsIcon icon={File02Icon} />}
        searchPlaceholder={m["legal_page.search"]()}
        opened={open ?? null}
        onOpened={(id) => void navigate({ to: '/legal-forms', search: id ? { open: id } : {}, replace: true })}
      />
    </article>
  )
}
