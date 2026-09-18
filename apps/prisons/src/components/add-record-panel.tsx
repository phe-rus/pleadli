import { PrisonerForm, prisonerFullName, usePrisoners, type Prisoner } from '@/features/prisoners'
import { OfficerForm } from '@/features/officers'
import { VisitForm } from '@/features/visits'
import { GavelIcon, PrisonerIcon, Search01Icon, UserGroupIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Badge } from '@pleadli/ui/badge'
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle, DrawerTrigger } from '@pleadli/ui/drawer'
import { Input } from '@pleadli/ui/input'
import { cn } from '@pleadli/ui/lib/utils'
import { ReactElement, Suspense, useState } from 'react'

type Category = 'prisoner' | 'officer' | 'visit'

const categories: { value: Category; label: string; icon: any; description: string }[] = [
  { value: 'prisoner', label: 'Prisoner', icon: PrisonerIcon, description: 'Admit under a warrant or order.' },
  { value: 'officer', label: 'Officer', icon: UserGroupIcon, description: 'Create an account for this installation.' },
  { value: 'visit', label: 'Visit', icon: GavelIcon, description: 'Record a visit against an existing prisoner.' },
]

/**
 * The single entry point for creating any kind of record, replacing the
 * previous narrow "Admit prisoner" panel: a category picker on the left,
 * the matching form on the right, at 80% of the viewport rather than a
 * fixed narrow drawer width — there's real room needed once more than one
 * form type lives in the same panel. Facility only: Head Office has no
 * prisoners or visits of its own, and already has its own "Add officer"
 * action on `/officers` (spec: docs/specs/prisons/0001-head-office-peer-
 * sync-network/index.md).
 */
export function AddRecordPanel({ trigger }: { trigger: ReactElement }) {
  const [open, setOpen] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [category, setCategory] = useState<Category>('prisoner')
  const [visitPrisoner, setVisitPrisoner] = useState<Prisoner | null>(null)

  const handleOpenChange = (next: boolean) => {
    if (!next && dirty) {
      const discard = window.confirm('You have unsaved changes. Discard them?')
      if (!discard) return
    }
    setOpen(next)
    if (!next) {
      setDirty(false)
      setCategory('prisoner')
      setVisitPrisoner(null)
    }
  }

  const close = () => {
    setOpen(false)
    setDirty(false)
    setCategory('prisoner')
    setVisitPrisoner(null)
  }

  return (
    <Drawer open={open} onOpenChange={handleOpenChange} swipeDirection="right">
      <DrawerTrigger render={trigger} />
      <DrawerContent className="bg-background!" style={{ ['--drawer-content-width' as string]: '80vw' }}>
        <DrawerHeader className="gap-0!">
          <DrawerTitle>Add record</DrawerTitle>
          <DrawerDescription className="md:max-w-sm">Pick what you're adding, then fill it in.</DrawerDescription>
        </DrawerHeader>

        <div className="flex min-h-0 flex-1">
          <nav className="flex w-48 shrink-0 flex-col gap-0.5 border-r border-border/60 p-2">
            {categories.map((c) => (
              <button
                key={c.value}
                type="button"
                onClick={() => {
                  setCategory(c.value)
                  setVisitPrisoner(null)
                }}
                className={cn(
                  'flex flex-col items-start gap-0.5 rounded-md px-3 py-2 text-left transition-colors',
                  category === c.value ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted/60',
                )}
              >
                <span className="flex items-center gap-2 text-sm font-medium">
                  <HugeiconsIcon icon={c.icon} size={15} />
                  {c.label}
                </span>
                <span className="text-xs">{c.description}</span>
              </button>
            ))}
          </nav>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {category === 'prisoner' && (
              <Suspense fallback={<PanelLoading />}>
                <PrisonerForm onSuccess={close} onDirtyChange={setDirty} />
              </Suspense>
            )}

            {category === 'officer' && (
              <div className="p-4">
                <OfficerForm onSuccess={close} />
              </div>
            )}

            {category === 'visit' &&
              (visitPrisoner ? (
                <Suspense fallback={<PanelLoading />}>
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center justify-between gap-2 border-b border-border/60 px-4 py-2.5">
                      <div className="flex items-center gap-2 text-sm">
                        <Badge variant="secondary">{visitPrisoner.id}</Badge>
                        {prisonerFullName(visitPrisoner)}
                      </div>
                      <button type="button" className="text-xs text-muted-foreground underline" onClick={() => setVisitPrisoner(null)}>
                        Change
                      </button>
                    </div>
                    <VisitForm prisonerId={visitPrisoner.id} onSuccess={close} onDirtyChange={setDirty} />
                  </div>
                </Suspense>
              ) : (
                <PrisonerPicker onSelect={setVisitPrisoner} />
              ))}
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  )
}

function PanelLoading() {
  return <div className="p-4 text-xs text-muted-foreground">Loading…</div>
}

/** Search within the panel itself, rather than requiring the officer to
 * back out and navigate to Search first — the whole point of Visit living
 * in this shared panel is not having to leave it to find the prisoner a
 * visit is for. */
function PrisonerPicker({ onSelect }: { onSelect: (prisoner: Prisoner) => void }) {
  const [query, setQuery] = useState('')

  return (
    <div className="flex flex-col gap-3 p-4">
      <div className="relative">
        <HugeiconsIcon icon={Search01Icon} size={14} className="absolute top-1/2 left-2.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search prisoners by name or national ID…"
          className="pl-8"
        />
      </div>

      <Suspense fallback={<PanelLoading />}>
        <PrisonerPickerResults query={query} onSelect={onSelect} />
      </Suspense>
    </div>
  )
}

function PrisonerPickerResults({ query, onSelect }: { query: string; onSelect: (prisoner: Prisoner) => void }) {
  const { data: prisoners } = usePrisoners(query)

  if (!query.trim()) {
    return <p className="px-1 py-6 text-center text-xs text-muted-foreground">Start typing to find a prisoner.</p>
  }

  if (prisoners.length === 0) {
    return <p className="px-1 py-6 text-center text-xs text-muted-foreground">No prisoners match "{query}".</p>
  }

  return (
    <div className="flex flex-col divide-y divide-border/60 overflow-hidden rounded-md border border-border/60">
      {prisoners.slice(0, 20).map((p) => (
        <button
          key={p.id}
          type="button"
          onClick={() => onSelect(p)}
          className="flex items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-muted/60"
        >
          <span className="truncate">{prisonerFullName(p)}</span>
          <Badge variant="secondary" className="shrink-0 text-[10px]">
            {p.id}
          </Badge>
        </button>
      ))}
    </div>
  )
}
