import { documentOptions } from '@/features/documents/queries'
import { mattersOptions } from '@/features/matters/queries'
import * as m from '@/paraglide/messages'
import { SparklesIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Button } from '@pleadli/ui/button'
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@pleadli/ui/select'
import { useQuery } from '@tanstack/react-query'
import { Link, useLocation } from '@tanstack/react-router'
import { useActor } from '@/features/installation'
import { useState } from 'react'
import { AssistPanel } from './assist-panel'
import { setAssistModel, useAssistModel } from './model-choice'
import { useAssistModels, useAssistSettings } from './queries'

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

/** Which model answers, chosen where the asking happens. Automatic (the
 * provider's recommended model, with backups) is the default; anyone may pick
 * another from the provider's own list, and it stays chosen on this computer. */
function ModelPicker({ provider }: { provider: string }) {
  const chosen = useAssistModel()
  const { data: models = [], isLoading } = useAssistModels(true, provider)
  const best = models.find((x) => x.rank === 1)
  const sorted = [...models].sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99) || a.label.localeCompare(b.label))
  const items = [
    { value: 'auto', label: best ? m["assist.model.auto_with"]({ model: best.label }) : m["assist.model.auto"]() },
    ...(chosen && !models.some((x) => x.id === chosen) ? [{ value: chosen, label: chosen }] : []),
    ...sorted.map((x) => ({ value: x.id, label: x.free ? `${x.label} · ${m["assist.model.free"]()}` : x.label })),
  ]
  return (
    <Select items={items} value={chosen || 'auto'} onValueChange={(v) => setAssistModel(!v || v === 'auto' ? '' : String(v))}>
      <SelectTrigger size="sm" aria-label={m["assist.model.label"]()} className="h-7 max-w-[12rem] min-w-0 rounded-full border-0 bg-foreground/[0.05] px-2.5 text-xs shadow-none">
        <SelectValue />
      </SelectTrigger>
      <SelectContent className="max-h-80">
        <SelectGroup>
          {items.map((item) => (
            <SelectItem key={item.value} value={item.value}>
              {item.label}
            </SelectItem>
          ))}
          {isLoading && <p className="px-2 py-1.5 text-xs text-muted-foreground">{m["assist.settings.loading_models"]()}</p>}
        </SelectGroup>
      </SelectContent>
    </Select>
  )
}

/** What Assist says on the left of the side panel header: its name, and
 * whether it is on a matter. */
export function AssistHeader() {
  const inView = useMatterInView()
  return (
    <h2 className="flex shrink-0 items-center gap-2 text-base">
      <HugeiconsIcon icon={SparklesIcon} className="size-5 text-primary" />
      {m["nav.assist"]()}
      {inView && <span className="text-xs font-normal text-muted-foreground">{m["assist.dock.on_matter"]()}</span>}
    </h2>
  )
}

/** Assist, in the side panel of every screen. On a matter (or one of its
 * documents) it works on that matter; elsewhere it asks which. */
export function AssistSidePanel() {
  const inView = useMatterInView()
  const [picked, setPicked] = useState("")
  const { data: settings } = useAssistSettings()
  const matterId = inView ?? picked
  return (
    <div className="flex flex-col gap-3 p-3">
      {settings?.ready && (
        <div className="flex justify-end">
          <ModelPicker provider={settings.provider} />
        </div>
      )}
      {settings?.ready && !inView && <MatterPicker value={picked} onChange={setPicked} />}
      {matterId ? <AssistPanel key={matterId} matterId={matterId} /> : !settings?.ready && <AssistPanelOff />}
    </div>
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
