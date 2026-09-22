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

const quickLinks = [
  { icon: UserIcon, label: 'People', to: '/search/people', description: 'Everyone known to this station' },
  { icon: CellsIcon, label: 'Cell lock-up & 48h', to: '/search/custody', description: 'Custody records, live 48h status' },
  { icon: File02Icon, label: 'Bonds & sureties', to: '/search/bonds', description: 'Police bonds granted' },
  { icon: FolderViewIcon, label: 'Case intake', to: '/intake', description: 'Opened cases' },
  { icon: SirenIcon, label: 'Incidents', to: '/incidents', description: 'Logged incidents' },
  { icon: Notebook01Icon, label: 'Station diary', to: '/sd-log', description: 'Counter and shift activity' },
  { icon: Mic01Icon, label: 'Statements', to: '/statements', description: 'Recorded statements' },
  { icon: ArchiveIcon, label: 'Stores & armory', to: '/stores/armory', description: 'Armory register and impounded assets' },
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
        <h1>Search Pleadli Police</h1>
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
            placeholder="Search by name, NIN, phone, case number, reference…"
            showClear
          >
            <ComboboxContent>
              <ComboboxList>
                {items.map((result) => (
                  <ComboboxItem key={`${result.entityType}:${result.id}`} value={`${result.entityType}:${result.id}`}>
                    <ResultRow result={result} />
                  </ComboboxItem>
                ))}
                {enabled && items.length === 0 && <ComboboxEmpty>No matches yet</ComboboxEmpty>}
              </ComboboxList>
            </ComboboxContent>
          </ComboboxInput>
        </Combobox>
      </section>

      {!enabled && (
        <section className="grid grid-cols-2 gap-3 md:grid-cols-3">
          {quickLinks.map((link) => (
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
