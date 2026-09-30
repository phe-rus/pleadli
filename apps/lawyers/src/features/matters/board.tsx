import { EmptyNote } from '@/components/planned'
import { matterTypeLabel, stageLabel, type MatterType } from '@/features/matter-types'
import { messageOf } from '@/lib/api'
import * as m from '@/paraglide/messages'
import { t } from '@pleadli/ui/goey-toaster'
import { cn } from '@pleadli/ui/lib/utils'
import { Link } from '@tanstack/react-router'
import { format } from 'date-fns/format'
import { useState } from 'react'
import { useSetStage } from './queries'
import type { MatterSummary } from './schema'

/** One kind of matter as a board: a column per stage, a card per open matter.
 * A card is dragged to another column, or moved with its own menu (for the
 * keyboard, and for anyone who does not drag). */
export function MatterBoard({ type, matters }: { type: MatterType; matters: MatterSummary[] }) {
  const setStage = useSetStage()
  const [over, setOver] = useState<string | null>(null)
  const mine = matters.filter((x) => x.matterType === type.id && x.status === 'open')

  const move = (matter: MatterSummary, stage: string) => {
    if (matter.stage === stage) return
    setStage.mutate(
      { id: matter.id, stage },
      { onSuccess: () => t.success(m["stage.moved"]({ stage: stageLabel(stage) })), onError: (error) => t.error(m["stage.move_failed"](), { description: messageOf(error) }) },
    )
  }

  if (mine.length === 0) return <EmptyNote>{m["board.empty"]({ type: matterTypeLabel(type.id) })}</EmptyNote>

  return (
    <div className="no-scrollbar -mx-1 flex gap-3 overflow-x-auto px-1 pb-2">
      {type.stages.map((stage) => {
        const cards = mine.filter((x) => x.stage === stage)
        return (
          <section
            key={stage}
            aria-label={stageLabel(stage)}
            onDragOver={(e) => {
              e.preventDefault()
              setOver(stage)
            }}
            onDragLeave={() => setOver((s) => (s === stage ? null : s))}
            onDrop={(e) => {
              e.preventDefault()
              setOver(null)
              const matter = mine.find((x) => x.id === e.dataTransfer.getData('text/plain'))
              if (matter) move(matter, stage)
            }}
            className={cn('flex w-64 shrink-0 flex-col gap-2 rounded-xl border bg-muted/30 p-2 transition-colors', over === stage ? 'border-primary bg-primary/5' : 'border-border/60')}
          >
            <header className="flex items-center justify-between px-1 pt-0.5">
              <h3>{stageLabel(stage)}</h3>
              <span className="text-muted-foreground tabular-nums">{cards.length}</span>
            </header>
            {cards.map((matter) => (
              <article
                key={matter.id}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData('text/plain', matter.id)
                  e.dataTransfer.effectAllowed = 'move'
                }}
                className="flex cursor-grab flex-col gap-1 rounded-lg border border-border bg-card p-3 shadow-xs active:cursor-grabbing"
              >
                <Link to="/matters/$matterId" params={{ matterId: matter.id }} className="font-medium text-foreground no-underline hover:underline">
                  {matter.courtNumber ?? matter.ourRef ?? matter.title}
                </Link>
                <p className="line-clamp-2 text-muted-foreground">{matter.courtNumber || matter.ourRef ? matter.title : matter.clientName}</p>
                <p className="text-muted-foreground">
                  {matter.nextHearingAt ? m["board.next_hearing"]({ when: format(matter.nextHearingAt, 'd MMM') }) : matter.clientName}
                  {matter.openTasks > 0 && ` · ${m["board.open_tasks"]({ count: matter.openTasks })}`}
                </p>
                <label className="mt-1 flex items-center gap-2 text-muted-foreground">
                  <span className="sr-only">{m["board.move_to"]()}</span>
                  <select
                    aria-label={m["board.move_to"]()}
                    value={matter.stage}
                    onChange={(e) => move(matter, e.target.value)}
                    className="h-7 w-full rounded-md border border-input bg-transparent px-1.5"
                  >
                    {type.stages.map((s) => (
                      <option key={s} value={s}>
                        {stageLabel(s)}
                      </option>
                    ))}
                  </select>
                </label>
              </article>
            ))}
          </section>
        )
      })}
    </div>
  )
}
