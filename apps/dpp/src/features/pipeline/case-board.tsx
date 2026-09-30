import { formatDate } from '@/lib/dates'
import * as m from '@/paraglide/messages'
import { SparklesIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { cn } from '@pleadli/ui/lib/utils'
import { Link } from '@tanstack/react-router'
import { useState } from 'react'
import { outcomeLabel } from './case-tab'
import { clockSentence, computeClocks, urgent, useCustody, type Clock } from '@/features/custody'
import { useJurisdiction } from '@/features/installation'
import { packText } from '@/lib/jurisdiction'
import { stageLabel, stages, type BoardCard, type Stage } from './data'
import { useBoard, useSetStage } from './queries'

const DAY = 86_400_000

function Card({ card, clocks }: { card: BoardCard; clocks: Clock[] }) {
  const alarm = clocks.find((c) => c.status === 'overdue') ?? clocks.find((c) => c.status === 'soon')
  const days = Math.max(0, Math.floor((Date.now() - (card.stageChangedAt ?? card.receivedAt)) / DAY))
  return (
    <Link
      to="/files/$fileId"
      params={{ fileId: card.id }}
      search={{ tab: 'case' }}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('text/case', card.id)
        e.dataTransfer.effectAllowed = 'move'
      }}
      className="flex cursor-grab flex-col gap-1.5 rounded-xl bg-card p-3 text-foreground no-underline shadow-xs ring-1 ring-border/60 transition-shadow hover:shadow-sm active:cursor-grabbing"
    >
      <strong className="line-clamp-2 text-sm leading-snug">{card.title}</strong>
      <span className="truncate font-mono text-xs text-muted-foreground">{card.reference ?? m["common.not_recorded"]()}</span>
      {card.accused && <span className="truncate text-xs">{card.accused}</span>}
      {alarm && (
        <span className={cn('rounded-lg px-2 py-1 text-xs', alarm.status === 'overdue' ? 'bg-destructive/10 text-destructive' : 'bg-amber-500/10 text-amber-800 dark:text-amber-300')}>
          {packText(alarm.limit.label)}: {clockSentence(alarm)}
        </span>
      )}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        {card.proposalWaiting && (
          <span className="inline-flex items-center gap-1 text-primary">
            <HugeiconsIcon icon={SparklesIcon} className="size-3" />
            {m["cases.proposal_ready"]()}
          </span>
        )}
        {card.nextHearingAt && <span>{m["cases.hearing"]({ date: formatDate(card.nextHearingAt) })}</span>}
        {card.outcome ? <span>{outcomeLabel(card.outcome)}</span> : <span className={cn(days > 14 && 'text-amber-600 dark:text-amber-400')}>{m["cases.days_here"]({ days })}</span>}
        {card.openTasks > 0 && <span>{m["cases.tasks"]({ count: card.openTasks })}</span>}
      </div>
    </Link>
  )
}

/** Every open case in its stage, like a project board. Open a card to read
 * what Assist prepared and accept it; drag a card to move it by hand. */
export function CaseBoard() {
  const { data: cards = [] } = useBoard()
  const { data: events = [] } = useCustody()
  const country = useJurisdiction()
  const clocksOf = (id: string) => urgent(computeClocks(events.filter((e) => e.prosecutionFileId === id), country))
  const move = useSetStage()
  const [over, setOver] = useState<Stage | null>(null)
  return (
    <div className="no-scrollbar -mx-2 flex min-h-0 flex-1 gap-3 overflow-x-auto px-2 pb-4">
      {stages.map((stage) => {
        const column = cards.filter((c) => c.stage === stage)
        return (
          <section
            key={stage}
            aria-label={stageLabel(stage)}
            onDragOver={(e) => {
              e.preventDefault()
              setOver(stage)
            }}
            onDragLeave={() => setOver((o) => (o === stage ? null : o))}
            onDrop={(e) => {
              e.preventDefault()
              setOver(null)
              const id = e.dataTransfer.getData('text/case')
              const card = cards.find((c) => c.id === id)
              if (card && card.stage !== stage) move.mutate({ fileId: id, stage })
            }}
            className={cn('flex w-64 shrink-0 flex-col gap-2 rounded-2xl bg-secondary/50 p-2 transition-colors', over === stage && 'bg-primary/10 ring-1 ring-primary/30')}
          >
            <header className="flex items-center justify-between px-2 pt-1">
              <h2 className="text-sm">{stageLabel(stage)}</h2>
              <span className="text-xs text-muted-foreground tabular-nums">{column.length}</span>
            </header>
            <div className="flex flex-col gap-2">
              {column.map((c) => (
                <Card key={c.id} card={c} clocks={clocksOf(c.id)} />
              ))}
              {column.length === 0 && <p className="px-2 py-6 text-center text-xs text-muted-foreground">{m["board.empty_column"]()}</p>}
            </div>
          </section>
        )
      })}
    </div>
  )
}
