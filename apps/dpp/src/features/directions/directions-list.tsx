import { Tag } from '@/components/status-tag'
import { ApiError } from '@/lib/api'
import { Button } from '@pleadli/ui/button'
import { t } from '@pleadli/ui/goey-toaster'
import { Textarea } from '@pleadli/ui/textarea'
import { format } from 'date-fns/format'
import { useState } from 'react'
import { useRespondToDirection } from './queries'
import { directionKindLabel, responseLabel, responses, type Direction } from './schema'

function Item({ direction, canRecord, personName }: { direction: Direction; canRecord: boolean; personName: string | null }) {
  const respond = useRespondToDirection()
  const [note, setNote] = useState(direction.responseNote ?? '')
  const record = (response: string) =>
    respond.mutate({ id: direction.id, response, note }, { onError: (e) => t.error('Could not record', { description: e instanceof ApiError ? e.message : 'Please try again.' }) })

  return (
    <div role="listitem" className="flex flex-col gap-2 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <Tag tone="neutral">{directionKindLabel(direction.kind)}</Tag>
        {personName && <span className="text-muted-foreground">From {personName}</span>}
        <Tag tone={direction.response === 'met' ? 'done' : direction.response === 'not_met' ? 'urgent' : 'open'} className="ml-auto">
          {responseLabel(direction.response)}
        </Tag>
      </div>
      <p className="text-foreground whitespace-pre-wrap">{direction.instruction}</p>
      {direction.responseNote && !canRecord && <p>{direction.responseNote}</p>}
      {canRecord && (
        <div className="flex flex-col gap-2">
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="What came back (optional)" aria-label="What came back" />
          <div className="flex flex-wrap items-center gap-2">
            {responses.map((r) => (
              <Button key={r.id} size="xs" type="button" variant={direction.response === r.id ? 'default' : 'outline'} onClick={() => record(r.id)}>
                {r.label}
              </Button>
            ))}
            {direction.response !== 'open' && (
              <Button size="xs" type="button" variant="ghost" onClick={() => record('open')}>
                Reopen
              </Button>
            )}
            {direction.respondedAt && <span className="text-muted-foreground">Recorded {format(direction.respondedAt, 'PP')}</span>}
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
