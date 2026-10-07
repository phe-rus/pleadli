import { Clock01Icon, File01Icon, LinkSquare02Icon, QuoteDownIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { cn } from '@pleadli/ui/lib/utils'
import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { findCitations } from './citations'
import { usePaperApp, type PaperStamp } from './context'
import { displayCode } from './sheet'
import { PaperView, type PaperMode } from './view'

export type PaperDetail = { label: string; value: ReactNode; copy?: string }
export type PaperLink = { key: string; label: string; sub?: string | null; onOpen: () => void }

type Version = PaperStamp & { body: string; title: string; printedBy: string | null }
type Tab = 'details' | 'history' | 'related' | 'citations'

function CopyButton({ text }: { text: string }) {
  const { labels } = usePaperApp()
  const [done, setDone] = useState(false)
  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard?.writeText(text)
        setDone(true)
        setTimeout(() => setDone(false), 1500)
      }}
      className="ms-2 cursor-pointer rounded border border-border px-1.5 text-xs text-muted-foreground hover:text-foreground"
    >
      {done ? labels.copied : labels.copy}
    </button>
  )
}

export type PaperEvent = { at: number; label: string; by?: string | null }

/**
 * The tabs ULII puts above a judgment or an Act, for any paper: its detail,
 * its history (app events, and every version that left the office), the
 * related papers on the file and its citations.
 */
export function PaperTabs({
  entityType,
  entityId,
  details,
  related = [],
  citedBy = [],
  events = [],
  wording,
  changed = false,
  reload = 0,
}: {
  entityType: string
  entityId: string
  details: PaperDetail[]
  related?: PaperLink[]
  citedBy?: PaperLink[]
  /** What happened to the paper besides printing: prepared, issued, received. */
  events?: PaperEvent[]
  /** The wording on the page, to find what it cites. */
  wording: string
  changed?: boolean
  /** Bump to read the history again (after a print). */
  reload?: number
}) {
  const app = usePaperApp()
  const { labels } = app
  // Folded until asked for: the paper is what the page is for, its details sit beside it.
  const [tab, setTab] = useState<Tab | null>(null)
  const [versions, setVersions] = useState<Version[]>([])
  const [reading, setReading] = useState<Version | null>(null)

  useEffect(() => {
    let alive = true
    app.history?.(entityType, entityId).then((v) => alive && setVersions(v)).catch(() => {})
    return () => {
      alive = false
    }
  }, [app, entityType, entityId, reload])

  const cites = findCitations(wording)
  const timeline = [
    ...versions.map((v) => ({ at: v.printedAt, version: v as Version | null, label: '', by: v.printedBy })),
    ...events.map((e) => ({ at: e.at, version: null as Version | null, label: e.label, by: e.by ?? null })),
  ].sort((a, b) => b.at - a.at)
  const tabs: { id: Tab; label: string; icon: typeof File01Icon; count?: number }[] = [
    { id: 'details', label: labels.tabs.details, icon: File01Icon },
    { id: 'history', label: labels.tabs.history, icon: Clock01Icon, count: timeline.length },
    { id: 'related', label: labels.tabs.related, icon: LinkSquare02Icon, count: related.length },
    { id: 'citations', label: labels.tabs.citations, icon: QuoteDownIcon, count: cites.length + citedBy.length },
  ]
  const latest = versions[0]

  const linkList = (links: PaperLink[]) => (
    <ul className="flex list-none flex-col gap-1 p-0">
      {links.map((l) => (
        <li key={l.key}>
          <button type="button" onClick={l.onOpen} className="cursor-pointer text-left text-sm text-primary underline-offset-2 hover:underline">
            {l.label}
          </button>
          {l.sub && <span className="ms-2 text-xs text-muted-foreground">{l.sub}</span>}
        </li>
      ))}
    </ul>
  )
  return (
    <section className="flex flex-col gap-3" data-paper-tools>
      {changed && <p className="rounded-lg bg-amber-500/10 px-3 py-2 text-sm text-amber-900 dark:text-amber-200">{labels.changedSincePrinted}</p>}
      <div role="tablist" className="no-scrollbar flex gap-1 overflow-x-auto">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab((open) => (open === t.id ? null : t.id))}
            className={cn(
              'inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-full px-3 py-1 text-[0.8125rem] transition-colors',
              tab === t.id ? 'bg-foreground/[0.07] font-medium text-foreground' : 'text-muted-foreground hover:bg-foreground/[0.04] hover:text-foreground',
            )}
          >
            <HugeiconsIcon icon={t.icon} className="size-3.5" />
            {t.label}
            {t.count ? <span className="rounded-full bg-secondary px-1.5 text-[0.625rem] leading-4 tabular-nums">{t.count}</span> : null}
          </button>
        ))}
      </div>

      {tab && <div role="tabpanel" className="rounded-xl bg-foreground/[0.025] p-4">
        {tab === 'details' && (
          <div className="flex flex-col gap-3">
            {latest && !changed && <p className="text-sm text-muted-foreground">{labels.latest}</p>}
            <div className="grid grid-cols-1 gap-x-10 gap-y-2 md:grid-cols-[1fr_16rem]">
              <dl className="not-typeset grid grid-cols-[minmax(8rem,auto)_1fr] items-baseline gap-x-4 gap-y-1.5 text-sm [&_dd]:m-0 [&_dd]:p-0 [&_dt]:m-0 [&_dt]:p-0">
                {details.map((d) => (
                  <div key={d.label} className="contents">
                    <dt className="font-medium">{d.label}</dt>
                    <dd className="ms-0 text-muted-foreground">
                      {d.value}
                      {d.copy && <CopyButton text={d.copy} />}
                    </dd>
                  </div>
                ))}
                {latest && (
                  <div className="contents">
                    <dt className="font-medium">{labels.verifyLine}</dt>
                    <dd className="ms-0 font-mono text-muted-foreground">
                      {displayCode(latest.code)}
                      <CopyButton text={displayCode(latest.code)} />
                    </dd>
                  </div>
                )}
              </dl>
              {related.length > 0 && (
                <div className="flex flex-col gap-1">
                  <p className="inline-flex items-center gap-1.5 text-sm font-medium">
                    <HugeiconsIcon icon={LinkSquare02Icon} className="size-3.5" />
                    {labels.tabs.related}
                  </p>
                  <button type="button" onClick={() => setTab('related')} className="w-fit cursor-pointer text-sm text-primary underline underline-offset-2">
                    {related.length}
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {tab === 'history' &&
          (timeline.length === 0 ? (
            <p className="text-sm text-muted-foreground">{labels.noHistory}</p>
          ) : (
            <ol className="flex list-none flex-col gap-0 border-s border-border/70 p-0 ps-4">
              {timeline.map((entry, i) => {
                const v = entry.version
                return (
                  <li key={v ? v.code : `${entry.at}-${entry.label}`} className="relative pb-3">
                    <span className={cn('absolute -start-[1.3rem] top-1.5 size-2.5 rounded-full', i === 0 ? 'bg-primary' : 'bg-border')} />
                    <p className="text-sm font-medium">{app.formatDate ? app.formatDate(entry.at) : new Date(entry.at).toLocaleString()}</p>
                    {v ? (
                      <>
                        <p className="text-xs text-muted-foreground">
                          {labels.printedBy(v.printedBy ?? '…', '')} <span className="font-mono">{displayCode(v.code)}</span>
                        </p>
                        <button type="button" onClick={() => setReading(reading?.code === v.code ? null : v)} className="cursor-pointer text-xs text-primary underline underline-offset-2">
                          {labels.readVersion}
                        </button>
                        {reading?.code === v.code && <pre className="mt-2 max-h-80 overflow-auto rounded-lg bg-secondary/50 p-3 font-serif text-xs whitespace-pre-wrap">{v.body}</pre>}
                      </>
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        {entry.label}
                        {entry.by ? `, ${entry.by}` : ''}
                      </p>
                    )}
                  </li>
                )
              })}
            </ol>
          ))}

        {tab === 'related' && (related.length ? linkList(related) : <p className="text-sm text-muted-foreground">{labels.noRelated}</p>)}

        {tab === 'citations' &&
          (cites.length + citedBy.length === 0 ? (
            <p className="text-sm text-muted-foreground">{labels.noCitations}</p>
          ) : (
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              {cites.length > 0 && (
                <div className="flex flex-col gap-1">
                  <p className="text-sm font-medium">{labels.cites}</p>
                  <ul className="flex list-disc flex-col gap-0.5 ps-5 text-sm text-muted-foreground">
                    {cites.map((c) => (
                      <li key={c}>{c}</li>
                    ))}
                  </ul>
                </div>
              )}
              {citedBy.length > 0 && (
                <div className="flex flex-col gap-1">
                  <p className="text-sm font-medium">{labels.citedBy}</p>
                  {linkList(citedBy)}
                </div>
              )}
            </div>
          ))}
      </div>}
    </section>
  )
}

/**
 * A paper laid out the way ULII lays out a judgment or an Act: its tools, then
 * the tabs, then the page itself, always in view.
 */
export function PaperPage({
  details,
  related = [],
  citedBy = [],
  events = [],
  children,
  ...view
}: Omit<Parameters<typeof PaperView>[0], 'above' | 'onStamped' | 'onWording'> & {
  details: PaperDetail[]
  related?: PaperLink[]
  citedBy?: PaperLink[]
  events?: PaperEvent[]
  children: ReactNode | ((mode: PaperMode) => ReactNode)
}) {
  const [wording, setWording] = useState('')
  const [changed, setChanged] = useState(false)
  const [reload, setReload] = useState(0)
  const onWording = useCallback((w: string, c: boolean) => {
    setWording(w)
    setChanged(c)
  }, [])
  return (
    <PaperView
      {...view}
      above={<PaperTabs entityType={view.entityType} entityId={view.entityId} details={details} related={related} citedBy={citedBy} events={events} wording={wording} changed={changed} reload={reload} />}
      onStamped={() => setReload((n) => n + 1)}
      onWording={onWording}
    >
      {children}
    </PaperView>
  )
}
