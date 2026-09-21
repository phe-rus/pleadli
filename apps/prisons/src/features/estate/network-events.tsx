import { Row, RowList } from '@/components/operational-row'
import { format } from 'date-fns/format'
import { m } from '@/paraglide/messages'
import { ago } from './format'
import type { Estate, NetworkEvent } from './schema'

function textOf({ kind, detail }: NetworkEvent) {
  const by = detail ?? ''
  switch (kind) {
    case 'return_received':
      return m.estate_event_return_received({ reference: by })
    case 'connection_requested':
      return m.estate_event_connection_requested({ name: by })
    case 'connection_approved':
      return m.estate_event_connection_approved({ name: by })
    case 'connection_rejected':
      return m.estate_event_connection_rejected({ name: by })
  }
}

/** What has lately reached Head Office or been decided at it: returns
 * received, and connections asked for, approved or refused. These are the only
 * events the records hold. There is no exchange log yet, so nothing else is
 * listed and nothing is made up to fill the space. */
export function NetworkEvents({ estate }: { estate: Estate }) {
  return (
    <section className="page-section" aria-labelledby="events-heading">
      <div className="section-head">
        <h2 id="events-heading">{m.estate_events_heading()}</h2>
      </div>
      {estate.events.length === 0 ? (
        <p>{m.estate_events_empty()}</p>
      ) : (
        <RowList>
          {estate.events.map((event) => (
            <Row
              key={`${event.kind}:${event.facilityId}:${event.at}`}
              title={event.facilityName}
              summary={textOf(event)}
              trailing={
                <time dateTime={new Date(event.at).toISOString()} title={format(event.at, 'PPp')} className="tabular-nums text-muted-foreground">
                  {ago(event.at)}
                </time>
              }
            />
          ))}
        </RowList>
      )}
    </section>
  )
}
