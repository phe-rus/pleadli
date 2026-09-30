import { formatDate } from '@/lib/dates'
import { useCreateTask } from '@/features/board/queries'
import { decisionTypeLabel } from '@/features/decisions/schema'
import * as m from '@/paraglide/messages'
import { Add01Icon, AlertCircleIcon, Cancel01Icon, SparklesIcon, Tick02Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Button } from '@pleadli/ui/button'
import { cn } from '@pleadli/ui/lib/utils'
import { Link } from '@tanstack/react-router'
import { useEffect, useState, type ReactNode } from 'react'
import type { BriefBody } from './data'
import { useAssistSettings, useBrief, useRequestBrief } from './queries'

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-xs tracking-wide text-muted-foreground uppercase">{title}</h3>
      {children}
    </section>
  )
}

function Waiting() {
  const [seconds, setSeconds] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setSeconds((s) => s + 1), 1000)
    return () => clearInterval(t)
  }, [])
  return (
    <div className="flex flex-col items-center gap-3 py-10 text-center">
      <HugeiconsIcon icon={SparklesIcon} className="size-7 animate-pulse text-primary" />
      <strong>{m["assist.reading_file"]()}</strong>
      <p className="text-muted-foreground">
        {m["assist.reading_body"]()} <span className="tabular-nums">{seconds}s</span>
      </p>
    </div>
  )
}

function NextStep({ fileId, step }: { fileId: string; step: BriefBody['nextSteps'][number] }) {
  const create = useCreateTask()
  const [added, setAdded] = useState(false)
  return (
    <li className="flex items-start gap-3 rounded-xl bg-card p-3 ring-1 ring-border/60">
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <strong>{step.title}</strong>
        <span className="text-muted-foreground">{step.why}</span>
      </div>
      <Button
        size="xs"
        variant={added ? 'ghost' : 'secondary'}
        disabled={added || create.isPending}
        onClick={() =>
          create.mutate(
            {
              prosecutionFileId: fileId,
              title: step.title,
              note: step.why,
              status: step.who === 'police' ? 'waiting_police' : step.who === 'court' ? 'waiting_court' : 'todo',
              source: 'assist',
            },
            { onSuccess: () => setAdded(true) },
          )
        }
      >
        <HugeiconsIcon icon={added ? Tick02Icon : Add01Icon} />
        {added ? m["assist.on_board"]() : m["assist.add_to_board"]()}
      </Button>
    </li>
  )
}

/** Assist beside the file: a brief of what the file shows, what is missing,
 * the decision options with reasons, and next steps that can go onto the
 * Board. Everything here is a draft for the prosecutor, labelled as such. */
export function AssistPanel({ fileId, onClose }: { fileId: string; onClose: () => void }) {
  const { data: settings } = useAssistSettings()
  const { data: brief } = useBrief(fileId)
  const request = useRequestBrief(fileId)
  const body = brief?.brief

  return (
    <aside aria-label={m["assist.title"]()} className="flex h-full w-full flex-col gap-4 overflow-y-auto border-l border-border/60 bg-background p-4 lg:w-[26rem] lg:shrink-0">
      <header className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2">
          <HugeiconsIcon icon={SparklesIcon} className="size-5 text-primary" />
          {m["assist.title"]()}
        </h2>
        <Button size="icon-sm" variant="ghost" onClick={onClose} aria-label={m["board.close"]()}>
          <HugeiconsIcon icon={Cancel01Icon} />
        </Button>
      </header>

      {!settings?.ready ? (
        <div className="flex flex-col gap-3 rounded-2xl bg-secondary/50 p-4">
          <strong>{m["assist.off_title"]()}</strong>
          <p className="text-muted-foreground">{m["assist.off_body"]()}</p>
          <Link to="/settings/$section" params={{ section: 'assist' }} className="w-fit">
            {m["assist.open_settings"]()}
          </Link>
        </div>
      ) : request.isPending ? (
        <Waiting />
      ) : (
        <>
          <div className="flex flex-col gap-2">
            <Button onClick={() => request.mutate()}>
              <HugeiconsIcon icon={SparklesIcon} />
              {body ? m["assist.refresh"]() : m["assist.prepare"]()}
            </Button>
            {request.isError && (
              <p className="not-typeset flex items-start gap-2 text-destructive">
                <HugeiconsIcon icon={AlertCircleIcon} className="mt-0.5 size-4 shrink-0" />
                {request.error.message}
              </p>
            )}
            {!body && <p className="text-muted-foreground">{m["assist.what_it_does"]()}</p>}
          </div>

          {body && brief && (
            <>
              <p className="rounded-xl bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-300">
                {m["assist.draft_label"]({ date: formatDate(brief.createdAt, 'datetime'), model: brief.model })}
              </p>

              <Block title={m["assist.summary"]()}>
                <p>{body.summary}</p>
              </Block>

              {body.options.length > 0 && (
                <Block title={m["assist.options"]()}>
                  <ul className="flex list-none flex-col gap-2 p-0">
                    {body.options.map((o, i) => (
                      <li key={i} className={cn('flex flex-col gap-1 rounded-xl p-3 ring-1', o.recommended ? 'bg-primary/5 ring-primary/40' : 'ring-border/60')}>
                        <div className="flex items-center justify-between gap-2">
                          <strong>{decisionTypeLabel(o.kind)}</strong>
                          {o.recommended && <span className="rounded-full bg-primary px-2 text-xs leading-5 text-primary-foreground">{m["assist.suggested"]()}</span>}
                        </div>
                        <p>
                          <span className="text-muted-foreground">{m["assist.for"]()} </span>
                          {o.for}
                        </p>
                        <p>
                          <span className="text-muted-foreground">{m["assist.against"]()} </span>
                          {o.against}
                        </p>
                      </li>
                    ))}
                  </ul>
                  <p className="text-xs text-muted-foreground">{m["assist.you_decide"]()}</p>
                </Block>
              )}

              {body.missing.length > 0 && (
                <Block title={m["assist.missing"]()}>
                  <ul className="flex flex-col gap-1 pl-4">
                    {body.missing.map((x, i) => (
                      <li key={i}>{x}</li>
                    ))}
                  </ul>
                </Block>
              )}

              {body.contradictions.length > 0 && (
                <Block title={m["assist.contradictions"]()}>
                  <ul className="flex flex-col gap-1 pl-4">
                    {body.contradictions.map((x, i) => (
                      <li key={i}>{x}</li>
                    ))}
                  </ul>
                </Block>
              )}

              {body.nextSteps.length > 0 && (
                <Block title={m["assist.next_steps"]()}>
                  <ul className="flex list-none flex-col gap-2 p-0">
                    {body.nextSteps.map((s, i) => (
                      <NextStep key={i} fileId={fileId} step={s} />
                    ))}
                  </ul>
                </Block>
              )}

              {body.offences.length > 0 && (
                <Block title={m["assist.offences"]()}>
                  <ul className="flex list-none flex-col gap-2 p-0">
                    {body.offences.map((o, i) => (
                      <li key={i} className="flex flex-col gap-0.5">
                        <strong>{o.offence}</strong>
                        {o.statute && <span className="text-muted-foreground">{o.statute}</span>}
                        <span>{o.why}</span>
                      </li>
                    ))}
                  </ul>
                  <p className="text-xs text-muted-foreground">{m["assist.check_law"]()}</p>
                </Block>
              )}

              {body.people.length > 0 && (
                <Block title={m["assist.people"]()}>
                  <ul className="flex list-none flex-col gap-2 p-0">
                    {body.people.map((p, i) => (
                      <li key={i} className="flex flex-col gap-0.5">
                        <strong>
                          {p.name} <span className="font-normal text-muted-foreground">({p.role})</span>
                        </strong>
                        <span>{p.says}</span>
                      </li>
                    ))}
                  </ul>
                </Block>
              )}
            </>
          )}
        </>
      )}
    </aside>
  )
}
