import { useAssistSettings } from '@/features/assist/queries'
import { useChargesForFile } from '@/features/charges'
import { formatDate } from '@/lib/dates'
import * as m from '@/paraglide/messages'
import { SparklesIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Button } from '@pleadli/ui/button'
import { t } from '@pleadli/ui/goey-toaster'
import { cn } from '@pleadli/ui/lib/utils'
import { usePropose, useProposals } from './queries'

const lbl = 'text-xs font-semibold tracking-wide text-muted-foreground'
const list = (v: unknown) => (Array.isArray(v) ? (v as unknown[]).filter((x): x is string => typeof x === 'string' && x.trim().length > 0) : [])

export type ReviewElement = { element: string; status: 'shown' | 'not_shown' | 'unclear'; source: string; against?: string }

/** Assist's element-by-element reading from the latest review brief: each thing
 * the offence needs proved, whether the papers show it, and where. */
export function useReviewElements(fileId: string): ReviewElement[] {
  const { data: proposals = [] } = useProposals(fileId)
  const latest = [...proposals].filter((p) => p.stage === 'review' && p.status !== 'rejected').sort((a, b) => b.createdAt - a.createdAt)[0]
  const raw = latest?.body?.elements
  return Array.isArray(raw) ? (raw as ReviewElement[]).filter((e) => e && typeof e.element === 'string') : []
}

/** Assist's reading of the papers, beside them: what the file says, what the
 * evidence shows, what is missing. It is the latest review brief for this
 * file, whether or not it has been answered, and it says it can be wrong. */
export function PeruseBrief({ fileId, rail }: { fileId: string; rail?: boolean }) {
  const { data: charges = [] } = useChargesForFile(fileId)
  const offence = charges[0] ? [charges[0].offence, charges[0].statutorySection].filter(Boolean).join(' · ') : ''
  const { data: proposals = [] } = useProposals(fileId)
  const { data: assist } = useAssistSettings()
  const propose = usePropose(fileId)
  const latest = [...proposals].filter((p) => p.stage === 'review' && p.status !== 'rejected').sort((a, b) => b.createdAt - a.createdAt)[0]
  const body = latest?.body ?? {}
  const gaps = [...list(body.missing), ...list(body.procedure), ...list(body.contradictions)]
  const elements = useReviewElements(fileId)
  const evidence = [...((body.evidential as { finding?: string; note?: string }[] | undefined) ?? [])].map((f) => f.note).filter(Boolean) as string[]

  return (
    <div className={cn('flex flex-col gap-3 rounded-2xl p-4 ring-1 ring-border/60', rail ? 'bg-card lg:sticky lg:top-4 lg:self-start' : 'bg-secondary/50')}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <HugeiconsIcon icon={SparklesIcon} className="size-4 text-primary" />
          <b className="text-[15px] font-semibold">Assist</b>
          {latest && <span className="text-xs text-muted-foreground">{formatDate(latest.createdAt, 'datetime')}</span>}
        </div>
        {assist?.ready && (
          <Button size="sm" variant="secondary" disabled={propose.isPending} onClick={() => propose.mutate('review', { onError: (e) => t.error(m["pipe.propose_failed"](), { description: e.message }) })}>
            <HugeiconsIcon icon={SparklesIcon} className={cn(propose.isPending && 'animate-pulse')} />
            {propose.isPending ? m["pipe.preparing"]() : latest ? m["pipe.ask_again"]() : m["pipe.ask_assist"]()}
          </Button>
        )}
      </div>
      {!latest ? (
        <p className="text-sm text-muted-foreground">{assist?.ready ? m["peruse.brief_none"]() : m["peruse.brief_off"]()}</p>
      ) : (
        <div className={cn('grid gap-4', rail ? 'grid-cols-1' : 'md:grid-cols-3')}>
          <div className="flex flex-col gap-1">
            <span className={lbl}>{m["peruse.summary"]()}</span>
            <p className="text-sm leading-relaxed">{String(body.summary ?? '')}</p>
          </div>
          <div className="flex flex-col gap-1">
            <span className={lbl}>{elements.length > 0 ? m["peruse.elements"]() : m["peruse.evidence"]()}</span>
            {elements.length > 0 ? (
              <ul className="m-0 flex list-none flex-col gap-1.5 p-0 text-sm leading-snug">
                {elements.map((e, i) => (
                  <li key={i} className="flex gap-2">
                    <span aria-hidden className={cn('shrink-0 font-semibold', e.status === 'shown' ? 'text-green-700' : 'text-[#9a3a00]')}>{e.status === 'shown' ? '✓' : e.status === 'unclear' ? '?' : '✗'}</span>
                    <span>
                      {e.element}
                      <span className="block text-xs text-muted-foreground">{e.status === 'shown' ? e.source : e.status === 'unclear' ? m["peruse.element_unclear"]() : m["peruse.element_not_shown"]()}</span>
                      {e.against?.trim() && <span className="block text-xs text-[#9a3a00]">{m["peruse.element_against"]({ text: e.against })}</span>}
                    </span>
                  </li>
                ))}
              </ul>
            ) : evidence.length === 0 ? <p className="text-sm text-muted-foreground">{m["peruse.nothing"]()}</p> : <ul className="m-0 flex list-none flex-col gap-1 p-0 text-sm leading-snug">{evidence.slice(0, 4).map((x, i) => <li key={i}>{x}</li>)}</ul>}
          </div>
          <div className="flex flex-col gap-1">
            <span className={lbl}>{m["peruse.gaps"]()}</span>
            {gaps.length === 0 ? <p className="text-sm text-muted-foreground">{m["peruse.no_gaps"]()}</p> : <ul className="m-0 flex list-none flex-col gap-1 p-0 text-sm leading-snug">{gaps.map((x, i) => <li key={i}>{x}</li>)}</ul>}
          </div>
        </div>
      )}
      {rail && offence && (
        <div className="flex flex-col gap-1">
          <span className={lbl}>{m["peruse.possible_offence"]()}</span>
          <p className="text-sm leading-relaxed">{offence}</p>
        </div>
      )}
      {latest?.model?.includes('lite') && <p className="text-xs text-[#9a3a00]">{m["peruse.small_model"]()}</p>}
      <p className="text-xs text-muted-foreground">{m["peruse.disclaimer"]()}</p>
    </div>
  )
}
