import * as m from '@/paraglide/messages'
import { entityTypeLabel, useSearch, type SearchResult } from '@/features/search'
import { parseSearchRoute } from '@/lib/parse-search-route'
import {
  ArchiveIcon,
  CellsIcon,
  File02Icon,
  FolderViewIcon,
  Mic01Icon,
  Notebook01Icon,
  SirenIcon,
  UserIcon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Badge } from '@pleadli/ui/badge'
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from '@pleadli/ui/combobox'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'

export const Route = createFileRoute('/_public/search/')({
  component: RouteComponent,
})

// A function, not a table, so the words are read in the current language.
const quickLinks = () =>
  [
    { icon: UserIcon, label: m["nav.people"](), to: '/search/people', description: m["search_page.people_desc"]() },
    { icon: CellsIcon, label: m["search_page.cells"](), to: '/search/custody', description: m["search_page.cells_desc"]() },
    { icon: File02Icon, label: m["nav.bonds_and_sureties"](), to: '/search/bonds', description: m["search_page.bonds_desc"]() },
    { icon: FolderViewIcon, label: m["nav.case_intake"](), to: '/intake', description: m["search_page.intake_desc"]() },
    { icon: SirenIcon, label: m["nav.incidents"](), to: '/incidents', description: m["search_page.incidents_desc"]() },
    { icon: Notebook01Icon, label: m["nav.station_diary"](), to: '/sd-log', description: m["search_page.diary_desc"]() },
    { icon: Mic01Icon, label: m["nav.statements"](), to: '/statements', description: m["search_page.statements_desc"]() },
    { icon: ArchiveIcon, label: m["search_page.stores"](), to: '/stores/armory', description: m["search_page.stores_desc"]() },
  ] as const

function ResultRow({ result }: { result: SearchResult }) {
  return (
    <div className="flex w-full items-center justify-between gap-3">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="text-[0.625rem]!">
            {entityTypeLabel(result.entityType)}
          </Badge>
          <span className="truncate text-sm">{result.title}</span>
        </div>
        {result.subtitle && <p className="truncate text-xs text-muted-foreground">{result.subtitle}</p>}
      </div>
      {result.matchedOn.value && (
        <span className="shrink-0 text-xs text-muted-foreground">
          {result.matchedOn.field}: {result.matchedOn.value}
        </span>
      )}
    </div>
  )
}

function RouteComponent() {
  const navigate = useNavigate()
  const [inputValue, setInputValue] = useState('')
  const query = inputValue.trim()
  const enabled = query.length > 0
  const { data: results } = useSearch(query)
  const items = results ?? []

  return (
    <article className="page">
      <section className="flex flex-col gap-2">
        <h1>{m["command_menu.title"]()}</h1>
        <Combobox
          inputValue={inputValue}
          onInputValueChange={setInputValue}
          onValueChange={(key) => {
            const result = items.find((r) => `${r.entityType}:${r.id}` === key)
            if (result) navigate(parseSearchRoute(result.route) as any)
          }}
        >
          <ComboboxInput
            className="md:max-w-lg rounded!"
            placeholder={m["command_menu.placeholder"]()}
            showClear
          >
            <ComboboxContent>
              <ComboboxList>
                {items.map((result) => (
                  <ComboboxItem key={`${result.entityType}:${result.id}`} value={`${result.entityType}:${result.id}`}>
                    <ResultRow result={result} />
                  </ComboboxItem>
                ))}
                {enabled && items.length === 0 && <ComboboxEmpty>{m["search_page.no_matches"]()}</ComboboxEmpty>}
              </ComboboxList>
            </ComboboxContent>
          </ComboboxInput>
        </Combobox>
      </section>

      {!enabled && (
        <section className="grid grid-cols-2 gap-3 md:grid-cols-3">
          {quickLinks().map((link) => (
            <Link
              key={link.to}
              to={link.to}
              className="flex flex-col gap-1 rounded-md border border-border/40 p-3 transition-colors hover:bg-muted/60"
            >
              <div className="flex items-center gap-2">
                <HugeiconsIcon icon={link.icon} className="size-4" />
                <h3 className="text-sm">{link.label}</h3>
              </div>
              <p className="text-xs text-muted-foreground">{link.description}</p>
            </Link>
          ))}
        </section>
      )}
    </article>
  )
}
