import { visibleNav } from '@/data/navigationItems'
import { entityTypeLabel, useSearch, type SearchResult } from '@/features/search'
import { useHqConfig, useSession } from '@/features/session'
import { useWorkspace } from '@/features/workspace/tabs-store'
import { parseSearchRoute } from '@/lib/parse-search-route'
import { ArrowDataTransferHorizontalIcon, CourtHouseIcon, Login02Icon, Message01Icon, UserGroupIcon } from '@hugeicons/core-free-icons'
import type { HugeiconsProps } from '@hugeicons/react'
import { HugeiconsIcon } from '@hugeicons/react'
import { Badge } from '@pleadli/ui/badge'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@pleadli/ui/dialog'
import { Input } from '@pleadli/ui/input'
import { cn } from '@pleadli/ui/lib/utils'
import { useNavigate } from '@tanstack/react-router'
import { useEffect, useMemo, useRef, useState } from 'react'
import { m } from '@/paraglide/messages'

export type CommandMenuProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
}

type CommandRow = {
  id: string
  kind: 'go' | 'start'
  label: string
  sublabel?: string
  icon?: HugeiconsProps['icon']
  run: () => void
}

/** The sidebar areas the officer may reach, flattened to palette rows.
 * `exact` children are not one-upped here: a row leaves whenever told to, it
 * never competes with a deeper match. */
function flatNavRows(isHeadOffice: boolean, permissions: readonly string[] | undefined, go: (to: string) => void): CommandRow[] {
  const nav = visibleNav(isHeadOffice, permissions)
  const rows: CommandRow[] = []
  for (const item of nav) {
    if (item.children) {
      for (const child of item.children) {
        rows.push({
          id: `go:${child.to}`,
          kind: 'go',
          label: child.label,
          sublabel: item.label,
          icon: child.icon,
          run: () => go(child.to!),
        })
      }
    } else {
      rows.push({
        id: `go:${item.to}`,
        kind: 'go',
        label: item.label,
        icon: item.icon,
        run: () => go(item.to!),
      })
    }
  }
  return rows
}

export function CommandMenu({ open, onOpenChange }: CommandMenuProps) {
  const navigate = useNavigate()
  const go = (to: string) => {
    void navigate(to as never)
  }
  const [query, setQuery] = useState('')
  const [highlighted, setHighlighted] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const { data: results } = useSearch(query)
  const { data: hqConfig } = useHqConfig()
  const isHeadOffice = hqConfig?.isHeadOffice ?? false
  const permissions = useSession().data?.permissions
  const { tabs, activeKey } = useWorkspace()
  const activeTab = tabs.find((tab) => tab.key === activeKey)

  // Navigation commands: every sidebar area the officer may actually reach,
  // kept in one place with the sidebar so a "go" never lands on a route the
  // node would refuse.
  const navRows = useMemo(() => flatNavRows(isHeadOffice, permissions, go), [isHeadOffice, permissions, navigate])
  const canStartProcedures = !isHeadOffice && (!permissions || permissions.includes('prisoner.read'))

  // Context commands: actions on the record that is currently open, so the
  // palette is aware of the workspace rather than a flat list of areas.
  const contextRows: CommandRow[] = useMemo(() => {
    if (!activeTab || activeTab.kind !== 'prisoner') return []
    const id = activeTab.to.replace(/^\/prisoners\//, '')
    const openFacet = (tab: 'legal' | 'care' | 'property' | 'history') =>
      void navigate({ to: '/prisoners/$prisonerId', params: { prisonerId: id }, search: { tab }, replace: true })
    const rows: CommandRow[] = [
      {
        id: `context:court:${id}`,
        kind: 'start',
        label: m.ui_create_a_court_production(),
        sublabel: activeTab.title,
        icon: CourtHouseIcon,
        run: () => openFacet('legal'),
      },
      {
        id: `context:documents:${id}`,
        kind: 'go',
        label: m.ui_open_property_and_documents(),
        sublabel: activeTab.title,
        icon: Message01Icon,
        run: () => openFacet('property'),
      },
      {
        id: `context:care:${id}`,
        kind: 'go',
        label: m.ui_open_care_and_contact(),
        sublabel: activeTab.title,
        icon: UserGroupIcon,
        run: () => openFacet('care'),
      },
    ]
    return rows
  }, [activeTab, navigate])

  const procedureRows: CommandRow[] = useMemo(() => {
    if (!canStartProcedures) return []
    return [
      {
        id: 'start:reception',
        kind: 'start',
        label: m.ui_receive_someone(),
        sublabel: m.ui_reception_under_a_warrant_or_order_2(),
        icon: Login02Icon,
        run: () => void navigate({ to: '/procedures/reception' as never }),
      },
      {
        id: 'start:receive-transfer',
        kind: 'start',
        label: m.ui_receive_a_transfer(),
        sublabel: m.ui_confirm_an_arrival_from_another_prison(),
        icon: ArrowDataTransferHorizontalIcon,
        run: () => void navigate({ to: '/procedures/receive' as never }),
      },
    ]
  }, [canStartProcedures, navigate])

  const commands = useMemo(() => {
    const term = query.trim().toLowerCase()
    const base = [...procedureRows, ...contextRows, ...navRows]
    if (!term) return base
    return base.filter((r) => r.label.toLowerCase().includes(term) || (r.sublabel ?? '').toLowerCase().includes(term))
  }, [navRows, procedureRows, contextRows, query])

  const rows: { command?: CommandRow; result?: SearchResult }[] = [
    ...commands.map((command) => ({ command })),
    ...(results ?? []).map((result) => ({ result })),
  ]

  useEffect(() => {
    if (open) {
      setQuery('')
      setHighlighted(0)
      requestAnimationFrame(() => inputRef.current?.focus())
    }
  }, [open])

  useEffect(() => {
    setHighlighted(0)
  }, [rows.length])

  const select = (index: number) => {
    const row = rows[index]
    if (!row) return
    if (row.command) {
      row.command.run()
      onOpenChange(false)
    } else if (row.result) {
      navigate(parseSearchRoute(row.result.route) as never)
      onOpenChange(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[calc(100%-2rem)] sm:max-w-lg md:max-w-xl" showCloseButton={false}>
        <DialogTitle className="sr-only">{m.ui_go_to_something_in_pleadli_prisons()}</DialogTitle>
        <DialogDescription className="sr-only">
          {m.ui_navigate_the_prison_start_a_procedure()}
        </DialogDescription>

        <Input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={m.ui_search_by_name_national_id_reference()}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault()
              setHighlighted((h) => Math.min(h + 1, rows.length - 1))
            } else if (e.key === 'ArrowUp') {
              e.preventDefault()
              setHighlighted((h) => Math.max(h - 1, 0))
            } else if (e.key === 'Enter') {
              e.preventDefault()
              select(highlighted)
            }
          }}
        />

        <div className="max-h-96 overflow-y-auto">
          {query.trim().length === 0 ? (
            <>
              {rows.length > 0 && (
                <>
                  {procedureRows.length > 0 && (
                    <p className="px-3 pt-1 pb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">{m.ui_start_a_procedure()}</p>
                  )}
                  {procedureRows.map((command) => {
                    const index = rows.findIndex((row) => row.command?.id === command.id)
                    return <CommandRowButton key={command.id} command={command} index={index} highlighted={highlighted} onSelect={select} onHover={setHighlighted} />
                  })}
                  {contextRows.length > 0 && (
                    <p className="px-3 pt-3 pb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">{m.ui_in_context()}</p>
                  )}
                  {contextRows.map((command) => {
                    const index = rows.findIndex((row) => row.command?.id === command.id)
                    return <CommandRowButton key={command.id} command={command} index={index} highlighted={highlighted} onSelect={select} onHover={setHighlighted} />
                  })}
                  <p className="px-3 pt-3 pb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">{m.ui_go_to()}</p>
                  {navRows.map((command) => {
                    const index = rows.findIndex((row) => row.command?.id === command.id)
                    return <CommandRowButton key={command.id} command={command} index={index} highlighted={highlighted} onSelect={select} onHover={setHighlighted} />
                  })}
                </>
              )}
            </>
          ) : rows.length === 0 ? (
            <p className="p-3 text-xs text-muted-foreground">{m.ui_no_matches_yet()}</p>
          ) : (
            <>
              {commands.length > 0 && (
                <p className="px-3 pt-1 pb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">{m.ui_go_to()}</p>
              )}
              {commands.map((command, index) => (
                <CommandRowButton key={command.id} command={command} index={index} highlighted={highlighted} onSelect={select} onHover={setHighlighted} />
              ))}
              {results && results.length > 0 && (
                <p className="px-3 pt-3 pb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">{m.ui_search_results()}</p>
              )}
              {(results ?? []).map((result, resultIndex) => {
                const index = commands.length + resultIndex
                return (
                  <button
                    key={`${result.entityType}:${result.id}`}
                    type="button"
                    onClick={() => select(index)}
                    onMouseEnter={() => setHighlighted(index)}
                    className={cn(
                      'flex w-full items-center justify-between gap-3 rounded-md px-2 py-1.5 text-left',
                      index === highlighted ? 'bg-accent text-accent-foreground' : 'hover:bg-muted/60',
                    )}
                  >
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
                  </button>
                )
              })}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

function CommandRowButton({
  command,
  index,
  highlighted,
  onSelect,
  onHover,
}: {
  command: CommandRow
  index: number
  highlighted: number
  onSelect: (index: number) => void
  onHover: (index: number) => void
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(index)}
      onMouseEnter={() => onHover(index)}
      className={cn(
        'flex w-full items-center gap-3 rounded-md px-2 py-1.5 text-left',
        index === highlighted ? 'bg-accent text-accent-foreground' : 'hover:bg-muted/60',
      )}
    >
      {command.icon && <HugeiconsIcon icon={command.icon} size={16} className="shrink-0 text-muted-foreground" />}
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="text-[0.625rem]!">
            {command.kind === 'start' ? m.ui_start() : m.ui_go()}
          </Badge>
          <span className="truncate text-sm">{command.label}</span>
        </div>
        {command.sublabel && <p className="truncate text-xs text-muted-foreground">{command.sublabel}</p>}
      </div>
    </button>
  )
}