import * as m from '@/paraglide/messages'
import { PanelButton } from '@/components/add-panel'
import { EmptyNote } from '@/components/planned'
import { PersonAvatar } from '@/components/person-avatar'
import { peopleSearchOptions, personFullName, PersonForm, usePeopleSearch, type Person } from '@/features/people'
import { Search01Icon, UserGroupIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Group, GroupRow } from '@pleadli/ui/grouped'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useMemo, useState } from 'react'

export const Route = createFileRoute('/_public/search/people/')({
  loader: async ({ context }) => {
    await context.queryClient.query({ ...peopleSearchOptions(''), staleTime: 'static' })
  },
  component: RouteComponent,
})

/** Everyone the station knows, as Contacts lists them: A to Z by surname,
 * each with their face, opening their page. */
function RouteComponent() {
  const navigate = useNavigate()
  const { data: people } = usePeopleSearch('')
  const [query, setQuery] = useState('')

  const letters = useMemo(() => {
    const needle = query.trim().toLowerCase()
    const shown = people
      .filter((p) => !needle || [personFullName(p), p.phone ?? '', p.nationalId ?? ''].some((t) => t.toLowerCase().includes(needle)))
      .sort((a, b) => a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName))
    const map = new Map<string, Person[]>()
    for (const p of shown) {
      const letter = (p.lastName[0] ?? '#').toUpperCase()
      map.set(letter, [...(map.get(letter) ?? []), p])
    }
    return [...map.entries()]
  }, [people, query])

  return (
    <article className="page">
      <header className="page-header">
        <div>
          <h1>{m["nav.people"]()}</h1>
          <p>{people.length === 1 ? m["people_page.count_one"]() : m["people_page.count"]({ count: people.length })}</p>
        </div>
        <div className="page-actions">
          <PanelButton label={m["pickers.person_add_title"]()} title={m["pickers.person_add_title"]()} description={m["pickers.person_add_description"]()} variant="default">
            {({ close }) => (
              <PersonForm
                onSuccess={(person) => {
                  close()
                  if (person?.id) void navigate({ to: '/search/people/$personId', params: { personId: person.id } })
                }}
              />
            )}
          </PanelButton>
        </div>
      </header>

      {people.length === 0 ? (
        <EmptyNote icon={<HugeiconsIcon icon={UserGroupIcon} />}>{m["people_page.empty"]()}</EmptyNote>
      ) : (
        <>
          <label className="flex h-9 max-w-sm items-center gap-2 rounded-lg bg-foreground/[0.045] px-3 text-muted-foreground focus-within:ring-2 focus-within:ring-ring/50">
            <HugeiconsIcon icon={Search01Icon} className="size-4 shrink-0" />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={m["people_page.search"]()}
              aria-label={m["people_page.search"]()}
              className="min-w-0 flex-1 bg-transparent text-foreground outline-none placeholder:text-muted-foreground"
            />
          </label>
          {letters.length === 0 && <EmptyNote>{m["files.no_match"]({ query })}</EmptyNote>}
          {letters.map(([letter, list]) => (
            <Group key={letter} title={letter}>
              {list.map((p) => (
                <GroupRow
                  key={p.id}
                  icon={<PersonAvatar name={personFullName(p)} headshotAttachmentId={p.headshotAttachmentId} size="sm" />}
                  label={
                    <>
                      {[p.firstName, p.otherNames].filter(Boolean).join(' ')} <strong>{p.lastName}</strong>
                    </>
                  }
                  detail={[p.nationalId, p.phone].filter(Boolean).join(' · ') || undefined}
                  chevron
                  render={({ className, children }) => (
                    <Link to="/search/people/$personId" params={{ personId: p.id }} className={className}>
                      {children}
                    </Link>
                  )}
                />
              ))}
            </Group>
          ))}
        </>
      )}
    </article>
  )
}
