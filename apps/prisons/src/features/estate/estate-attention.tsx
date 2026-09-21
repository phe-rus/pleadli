import { Row, RowList } from '@/components/operational-row'
import { m } from '@/paraglide/messages'
import { ago, monthOf } from './format'
import type { Attention, AttentionKind, Estate } from './schema'

/** The needs that are about a facility's condition. A facility waiting to be
 * verified is Head Office's to act on, so it is listed under what Head Office
 * has to do, not here. */
const isFacilityAttention = (item: Attention) => item.kind !== 'pending_verification'

const kindLabel: Record<AttentionKind, () => string> = {
  silent: () => m.estate_kind_silent(),
  never_contacted: () => m.estate_kind_silent(),
  pending_verification: () => m.estate_kind_verification(),
  return_overdue: () => m.estate_kind_return(),
  over_capacity: () => m.estate_kind_capacity(),
}

function textOf(item: Attention, estate: Estate) {
  const when = ago(item.since) ?? ''
  switch (item.kind) {
    case 'silent':
      return m.estate_attention_silent({ when })
    case 'never_contacted':
      return m.estate_attention_never()
    case 'pending_verification':
      return m.estate_attention_pending()
    case 'return_overdue':
      return m.estate_attention_return({ month: monthOf(estate.returnPeriodFrom) })
    case 'over_capacity':
      return m.estate_attention_over({ percent: item.figure ?? 0, when })
  }
}

/** The facilities that need looking at, one line each with what is wrong and
 * how long it has been so. Only what the estate view derives from the records
 * is listed: silence, no contact yet, an overdue return, a facility over its
 * capacity. */
export function EstateAttention({ estate }: { estate: Estate }) {
  const items = estate.attention.filter(isFacilityAttention)
  return (
    <section className="page-section" aria-labelledby="estate-attention-heading">
      <div className="section-head">
        <h2 id="estate-attention-heading">{m.estate_needs_attention()}</h2>
        {items.length > 0 && <p>{m.attention_count({ count: items.length })}</p>}
      </div>
      {items.length === 0 ? (
        <p>{m.estate_nothing_needs_attention()}</p>
      ) : (
        <RowList>
          {items.map((item) => (
            <Row
              key={`${item.kind}:${item.facilityId}`}
              marker="open"
              title={item.facilityName}
              summary={textOf(item, estate)}
              trailing={<span className="text-muted-foreground">{kindLabel[item.kind]()}</span>}
            />
          ))}
        </RowList>
      )}
    </section>
  )
}
