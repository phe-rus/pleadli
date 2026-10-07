import { documentOptions } from '@/features/documents/queries'
import { mattersOptions } from '@/features/matters/queries'
import * as m from '@/paraglide/messages'
import { Cancel01Icon, SparklesIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Button } from '@pleadli/ui/button'
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@pleadli/ui/select'
import { useQuery } from '@tanstack/react-query'
import { Link, useLocation } from '@tanstack/react-router'
import { useActor } from '@/features/installation'
import { useState, useSyncExternalStore } from 'react'
import { AssistPanel } from './assist-panel'
import { useAssistSettings } from './queries'

// ---------------------------------------------------------------- open or closed, everywhere

const KEY = 'pleadli:lawyers:assist-open'
const listeners = new Set<() => void>()
function readOpen() {
  try {
    return localStorage.getItem(KEY) === '1'
  } catch {
    return false
  }
}
let open = readOpen()
export function setAssistOpen(next: boolean | ((was: boolean) => boolean)) {
  open = typeof next === 'function' ? next(open) : next
  try {
    localStorage.setItem(KEY, open ? '1' : '0')
  } catch {}
  listeners.forEach((l) => l())
}
export function useAssistOpen() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => open,
  )
}

/** The matter on screen, if any: a matter's page, or the matter a document
 * on screen belongs to. */
function useMatterInView() {
  const pathname = useLocation({ select: (l) => l.pathname })
  const documentId = /^\/documents\/([^/]+)/.exec(pathname)?.[1]
  const { data: doc } = useQuery({ ...documentOptions(documentId ?? ''), enabled: Boolean(documentId) })
  return /^\/matters\/([^/]+)/.exec(pathname)?.[1] ?? doc?.matterId ?? null
}

/** Away from a matter, Assist asks which one, from the open matters. */
function MatterPicker({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  const { data: matters = [] } = useQuery(mattersOptions('open'))
  const items = matters.map((mt) => ({ value: mt.id, label: mt.courtNumber ? `${mt.courtNumber} · ${mt.title}` : mt.title }))
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor="assist-dock-matter">{m["assist_page.which_matter"]()}</label>
      <Select items={items} value={value} onValueChange={(v) => onChange(v ?? '')}>
        <SelectTrigger id="assist-dock-matter" className="w-full">
          <SelectValue placeholder={m["assist_page.choose_matter"]()} />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {items.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
      {items.length === 0 && <p className="text-muted-foreground">{m["assist_page.no_matters"]()}</p>}
    </div>
  )
}

/** Assist, docked on the right of every screen and opened from the title bar.
 * On a matter (or one of its documents) it works on that matter; elsewhere it
 * asks which. */
export function AssistDock() {
  const isOpen = useAssistOpen()
  const inView = useMatterInView()
  const [picked, setPicked] = useState('')
  const { data: settings } = useAssistSettings()
  if (!isOpen) return null
  const matterId = inView ?? picked
  return (
    <aside aria-label={m["nav.assist"]()} className="flex w-[24rem] shrink-0 flex-col gap-3 overflow-y-auto border-l border-border/40 bg-background p-3 print:hidden">
      <header className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-base">
          <HugeiconsIcon icon={SparklesIcon} className="size-5 text-primary" />
          {m["nav.assist"]()}
          {inView && <span className="text-xs font-normal text-muted-foreground">{m["assist.dock.on_matter"]()}</span>}
        </h2>
        <Button size="icon-sm" variant="ghost" onClick={() => setAssistOpen(false)} aria-label={m["assist.dock.close"]()} title={m["assist.dock.close"]()}>
          <HugeiconsIcon icon={Cancel01Icon} />
        </Button>
      </header>
      {settings?.ready && !inView && <MatterPicker value={picked} onChange={setPicked} />}
      {matterId ? <AssistPanel key={matterId} matterId={matterId} /> : !settings?.ready && <AssistPanelOff />}
    </aside>
  )
}

/** Before Assist is set up there is no matter to pick; the panel says who turns it on. */
function AssistPanelOff() {
  const actor = useActor()
  return (
    <div className="flex flex-col gap-3">
      <p className="text-muted-foreground">{m["assist_page.off_description"]()}</p>
      {actor?.isAdmin ? (
        <Button size="sm" className="self-start" nativeButton={false} render={<Link to="/settings/$section" params={{ section: 'assist' }} />}>
          {m["assist_page.turn_on"]()}
        </Button>
      ) : (
        <p className="text-muted-foreground">{m["assist_page.off_ask_admin"]()}</p>
      )}
    </div>
  )
}
