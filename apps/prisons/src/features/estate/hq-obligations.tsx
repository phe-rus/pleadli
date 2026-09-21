import { Row, RowList } from '@/components/operational-row'
import { buttonVariants } from '@pleadli/ui/button'
import { Link } from '@tanstack/react-router'
import { m } from '@/paraglide/messages'
import type { Estate } from './schema'

/** What Head Office itself has to do: decide the connection requests waiting
 * and verify the facilities that have registered. Both are decisions for
 * someone at Head Office, unlike a facility that has gone quiet, which is
 * listed under what needs attention. There is no review step for received
 * returns (Head Office acknowledges them on receipt), so none is listed. */
export function HqObligations({ estate }: { estate: Estate }) {
  const verifying = estate.attention.filter((item) => item.kind === 'pending_verification')
  const empty = estate.connectionRequestsWaiting === 0 && verifying.length === 0
  const action = (label: string) => (
    <Link to="/facilities" className={buttonVariants({ size: 'xs', variant: 'secondary' })}>
      {label}
    </Link>
  )

  return (
    <section className="page-section" aria-labelledby="obligations-heading">
      <div className="section-head">
        <h2 id="obligations-heading">{m.estate_obligations_heading()}</h2>
      </div>
      {empty ? (
        <p>{m.estate_obligations_empty()}</p>
      ) : (
        <RowList>
          {estate.connectionRequestsWaiting > 0 && (
            <Row title={m.estate_kind_request()} summary={m.estate_requests_waiting({ count: estate.connectionRequestsWaiting })} trailing={action(m.attention_review())} />
          )}
          {verifying.map((item) => (
            <Row key={item.facilityId} title={item.facilityName} summary={m.estate_attention_pending()} trailing={action(m.estate_verify())} />
          ))}
        </RowList>
      )}
    </section>
  )
}
