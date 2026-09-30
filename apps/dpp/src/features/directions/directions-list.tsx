import { formatDate } from '@/lib/dates'
import { Tag } from '@/components/status-tag'
import { ApiError } from '@/lib/api'
import { Button } from '@pleadli/ui/button'
import { t } from '@pleadli/ui/goey-toaster'
import { Textarea } from '@pleadli/ui/textarea'
import { useState } from 'react'
import { useRespondToDirection } from './queries'
import { directionKindLabel, responseLabel, responses, type Direction } from './schema'
import * as m from '@/paraglide/messages'

function Item({ direction, canRecord, personName }: { direction: Direction; canRecord: boolean; personName: string | null }) {
  const respond = useRespondToDirection()
  const [note, setNote] = useState(direction.responseNote ?? '')
  const record = (response: string) =>
    respond.mutate({ id: direction.id, response, note }, { onError: (e) => t.error(m["common.could_not_record"](), { description: e instanceof ApiError ? e.message : m["common.try_again"]() }) })

  return (
    <div role="listitem" className="flex flex-col gap-2 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <Tag tone="neutral">{directionKindLabel(direction.kind)}</Tag>
        {personName && <span className="text-muted-foreground">{m["direction.list.from"]({ name: personName })}</span>}
        <Tag tone={direction.response === 'met' ? 'done' : direction.response === 'not_met' ? 'urgent' : 'open'} className="ml-auto">
          {responseLabel(direction.response)}
        </Tag>
      </div>
      <p className="text-foreground whitespace-pre-wrap">{direction.instruction}</p>
      {direction.responseNote && !canRecord && <p>{direction.responseNote}</p>}
      {canRecord && (
        <div className="flex flex-col gap-2">
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder={m["direction.list.what_came_back_placeholder"]()} aria-label={m["direction.list.what_came_back"]()} />
          <div className="flex flex-wrap items-center gap-2">
            {responses.map((r) => (
              <Button key={r.id} size="xs" type="button" variant={direction.response === r.id ? 'default' : 'outline'} onClick={() => record(r.id)}>
                {r.label}
              </Button>
            ))}
            {direction.response !== 'open' && (
              <Button size="xs" type="button" variant="ghost" onClick={() => record('open')}>
                {m["direction.list.reopen"]()}
              </Button>
            )}
            {direction.respondedAt && <span className="text-muted-foreground">{m["direction.list.recorded_on"]({ date: formatDate(direction.respondedAt) })}</span>}
          </div>
        </div>
      )}
    </div>
  )
}

/** The directions of a return. Once the file has come back, each can be
 * recorded as met or not met; until then they are read-only. */
export function DirectionsList({ directions, canRecord, personNames = {} }: { directions: readonly Direction[]; canRecord: boolean; personNames?: Record<string, string> }) {
  return (
    <div role="list" className="flex flex-col divide-y divide-border/60 border-y border-border/60">
      {directions.map((d) => (
        <Item key={d.id} direction={d} canRecord={canRecord} personName={d.personId ? (personNames[d.personId] ?? null) : null} />
      ))}
    </div>
  )
}
