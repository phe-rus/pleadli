import * as m from '@/paraglide/messages'
import { PanelButton } from '@/components/add-panel'
import { EmptyNote } from '@/components/planned'
import { caseFolders, isCaseFolder, type CaseFolder } from '@/data/navigationItems'
import { CaseForm, casesOptions, inCaseFolder, useCases } from '@/features/cases'
import { referralsOptions, useReferrals } from '@/features/referrals'
import { format } from '@/lib/date'
import { BinocularsIcon, Search01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Group, GroupRow } from '@pleadli/ui/grouped'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useMemo, useState } from 'react'

export const Route = createFileRoute('/_public/investigations/')({
  validateSearch: (search: Record<string, unknown>): { view?: CaseFolder } => (isCaseFolder(search.view) ? { view: search.view } : {}),
  loader: async ({ context }) => {
    await Promise.all([
      context.queryClient.query({ ...casesOptions(''), staleTime: 'static' }),
      context.queryClient.query({ ...referralsOptions(''), staleTime: 'static' }),
    ])
  },
  component: RouteComponent,
})

/** What each folder holds, in one line under its title. */
const about: Record<CaseFolder, () => string> = {
  investigating: () => m["cases.folder_about.investigating"](),
  dpp: () => m["cases.folder_about.dpp"](),
  closed: () => m["cases.folder_about.closed"](),
  all: () => m["cases.folder_about.all"](),
}

const empty: Record<CaseFolder, () => string> = {
  investigating: () => m["cases.folder_empty.investigating"](),
  dpp: () => m["cases.folder_empty.dpp"](),
  closed: () => m["cases.folder_empty.closed"](),
  all: () => m["cases.folder_empty.all"](),
}

/** The station's cases, one folder at a time, newest first. A case opens its
 * investigation; opening a new one is the single action here. */
function RouteComponent() {
  const { view = 'investigating' } = Route.useSearch()
  const navigate = useNavigate()
  const { data: cases } = useCases('')
  const { data: referrals } = useReferrals('')
  const [query, setQuery] = useState('')
  const folder = caseFolders.find((f) => f.id === view)!

  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return cases
      .filter((c) => inCaseFolder(view, c, referrals))
      .filter((c) => !needle || [c.reference, c.summary, c.incidentSummary ?? ''].some((text) => text.toLowerCase().includes(needle)))
      .sort((a, b) => b.createdAt - a.createdAt)
  }, [cases, referrals, view, query])

  const total = cases.filter((c) => inCaseFolder(view, c, referrals)).length

  return (
    <article className="page">
      <header className="page-header">
        <div>
          <h1>{folder.label}</h1>
          <p>
            {total === 1 ? m["cases.count_one"]() : m["cases.count"]({ count: total })} · {about[view]()}
          </p>
        </div>
        <div className="page-actions">
          <PanelButton label={m["cases.submit"]()} title={m["cases.submit"]()} description={m["intake_page.add_desc"]()} variant="default">
            {({ close, setDirty }) => (
              <CaseForm
                onDirtyChange={setDirty}
                onSuccess={(created) => {
                  close()
                  void navigate({ to: '/investigations/$caseId', params: { caseId: created.id } })
                }}
              />
            )}
          </PanelButton>
        </div>
      </header>

      {total === 0 ? (
        <EmptyNote icon={<HugeiconsIcon icon={BinocularsIcon} />}>{empty[view]()}</EmptyNote>
      ) : (
        <>
          <label className="flex h-9 max-w-sm items-center gap-2 rounded-lg bg-foreground/[0.045] px-3 text-muted-foreground focus-within:ring-2 focus-within:ring-ring/50">
            <HugeiconsIcon icon={Search01Icon} className="size-4 shrink-0" />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={m["intake_page.search"]()}
              aria-label={m["intake_page.search"]()}
              className="min-w-0 flex-1 bg-transparent text-foreground outline-none placeholder:text-muted-foreground"
            />
          </label>
          {shown.length === 0 ? (
            <EmptyNote>{m["cases.no_match"]({ query })}</EmptyNote>
          ) : (
            <Group>
              {shown.map((c) => (
                <GroupRow
                  key={c.id}
                  label={<span className="font-medium">{c.reference}</span>}
                  detail={[c.summary, c.incidentSummary].filter(Boolean).join(' · ')}
                  value={
                    <span className="flex flex-col items-end text-xs leading-tight">
                      <span>{format(c.createdAt, 'd MMM yyyy')}</span>
                      <span>{c.peopleCount === 1 ? m["cases.people_one"]() : m["cases.people"]({ count: c.peopleCount })}</span>
                    </span>
                  }
                  chevron
                  render={({ className, children }) => (
                    <Link to="/investigations/$caseId" params={{ caseId: c.id }} className={className}>
                      {children}
                    </Link>
                  )}
                />
              ))}
            </Group>
          )}
        </>
      )}
    </article>
  )
}
