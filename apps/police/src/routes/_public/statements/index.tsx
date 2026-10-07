import * as m from '@/paraglide/messages'
import { PanelButton } from '@/components/add-panel'
import { StatementPaper } from '@/features/paper/case-papers'
import { RecordList } from '@/features/paper/record-list'
import { statementsOptions, StatementForm, statementPersonName, useStatements } from '@/features/statements'
import { format } from '@/lib/date'
import { Mic01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { richTextToPlainText } from '@pleadli/rich-text'
import { createFileRoute, useNavigate } from '@tanstack/react-router'

export const Route = createFileRoute('/_public/statements/')({
  validateSearch: (search: Record<string, unknown>): { open?: string } => (typeof search.open === 'string' ? { open: search.open } : {}),
  loader: async ({ context }) => {
    await context.queryClient.query({ ...statementsOptions(''), staleTime: 'static' })
  },
  component: RouteComponent,
})

/** Every statement taken at the station, by month; each opens as the signed statement. */
function RouteComponent() {
  const { open } = Route.useSearch()
  const navigate = useNavigate()
  const { data: statements } = useStatements('')

  return (
    <article className="page">
      <header className="page-header">
        <div>
          <h1>{m["nav.statements"]()}</h1>
          <p>{statements.length === 1 ? m["statements_page.count_one"]() : m["statements_page.count"]({ count: statements.length })}</p>
        </div>
        <div className="page-actions">
          <PanelButton label={m["statements_page.new"]()} title={m["statements_page.new"]()} description={m["statements_page.add_desc"]()} variant="default">
            {({ close, setDirty }) => <StatementForm onSuccess={close} onDirtyChange={setDirty} />}
          </PanelButton>
        </div>
      </header>
      <RecordList
        items={statements}
        date={(s) => s.givenAt}
        label={(s) => statementPersonName(s)}
        detail={(s) => [format(s.givenAt, 'd MMM, HH:mm'), s.caseReference, s.officerName ? m["investigation.taken_by"]({ name: s.officerName }) : null].filter(Boolean).join(' · ')}
        searchText={(s) => [statementPersonName(s), s.caseReference ?? '', s.officerName ?? '', richTextToPlainText(s.content)].join(' ')}
        paper={(s) => <StatementPaper statement={s} />}
        windowTitle={(s) => statementPersonName(s)}
        empty={m["statements_page.empty"]()}
        emptyIcon={<HugeiconsIcon icon={Mic01Icon} />}
        searchPlaceholder={m["statements_page.search"]()}
        opened={open ?? null}
        onOpened={(id) => void navigate({ to: '/statements', search: id ? { open: id } : {}, replace: true })}
      />
    </article>
  )
}
