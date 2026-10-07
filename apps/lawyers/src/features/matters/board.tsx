import { EmptyNote } from '@/components/planned'
import { MoreHorizontalIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Button } from '@pleadli/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from '@pleadli/ui/dropdown-menu'
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
                className="flex cursor-grab flex-col gap-1 rounded-lg border border-border bg-card p-3 shadow-sm transition-shadow hover:shadow-md active:cursor-grabbing"
              >
                {(matter.courtNumber || matter.ourRef) && <p className="m-0 text-xs text-muted-foreground">{matter.courtNumber ?? matter.ourRef}</p>}
                <Link to="/matters/$matterId" params={{ matterId: matter.id }} className="line-clamp-2 font-medium text-foreground no-underline hover:underline">
                  {matter.title}
                </Link>
                <div className="mt-2 flex items-center justify-between gap-2 border-t border-border/60 pt-2">
                  <p className="m-0 min-w-0 truncate text-xs text-muted-foreground">
                    {matter.nextHearingAt ? m["board.next_hearing"]({ when: format(matter.nextHearingAt, 'd MMM') }) : matter.clientName}
                    {matter.openTasks > 0 && ` · ${m["board.open_tasks"]({ count: matter.openTasks })}`}
                  </p>
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      render={
                        <Button size="icon-sm" variant="ghost" aria-label={m["board.move_to"]()} title={m["board.move_to"]()}>
                          <HugeiconsIcon icon={MoreHorizontalIcon} />
                        </Button>
                      }
                    />
                    <DropdownMenuContent align="end">
                      <DropdownMenuGroup>
                        <DropdownMenuLabel>{m["board.move_to"]()}</DropdownMenuLabel>
                        {type.stages
                          .filter((s) => s !== matter.stage)
                          .map((s) => (
                            <DropdownMenuItem key={s} onClick={() => move(matter, s)}>
                              {stageLabel(s)}
                            </DropdownMenuItem>
                          ))}
                      </DropdownMenuGroup>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </article>
            ))}
          </section>
        )
      })}
    </div>
  )
}
