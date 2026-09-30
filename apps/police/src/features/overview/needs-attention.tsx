import * as m from '@/paraglide/messages'
import { EmptyNote } from '@/components/planned'
import { Row, RowList } from '@/components/operational-row'
import { Tag } from '@/components/status-tag'
import { custodyCompliance, custodyPersonName, type CustodyRecord } from '@/features/custody/schema'
import { Link } from '@tanstack/react-router'
import { format } from '@/lib/date'
import { formatDistanceToNowStrict } from '@/lib/date'

/** A person in custody is listed here once the record puts them within this
 * many hours of the limit, or past it. Everyone else in the cells is on the
 * custody board, ordered by the same deadline. */
const LISTED_WITHIN_HOURS = 12

const openLink = 'text-primary'

function hoursPhrase(hours: number) {
  const abs = Math.abs(hours)
  if (abs < 1) return m["custody.minutes"]({ count: Math.max(1, Math.round(abs * 60)) })
  return Math.round(abs) === 1 ? m["custody.hour_one"]() : m["custody.hours"]({ count: Math.round(abs) })
}

/** What needs an officer now, and only that: each item is read from the
 * station's records, and a station with nothing outstanding is told so. The
 * only dates shown are ones the record itself fixes (arrest plus 48 hours, or
 * the cross-jurisdiction windows). */
export function NeedsAttention({ inCustody, referralsPending }: { inCustody: CustodyRecord[]; referralsPending: number }) {
  const due = inCustody
    .map((record) => ({ record, compliance: custodyCompliance(record) }))
    .filter(({ compliance }) => compliance.hoursRemaining <= LISTED_WITHIN_HOURS)
    .sort((a, b) => a.compliance.deadline - b.compliance.deadline)

  const count = due.length + (referralsPending > 0 ? 1 : 0)

  return (
    <section aria-labelledby="attention" className="page-section">
      <div className="section-head">
        <h2 id="attention">{m["common.needs_attention"]()}</h2>
        {count > 0 && <Tag tone="open">{count === 1 ? m["common.item_one"]() : m["common.item_count"]({ count })}</Tag>}
      </div>

      {count === 0 ? (
        <EmptyNote>{m["attention.empty"]()}</EmptyNote>
      ) : (
        <RowList>
          {due.map(({ record, compliance }) => (
            <Row
              key={record.id}
              marker={compliance.isOverdue ? 'urgent' : 'open'}
              title={custodyPersonName(record)}
              summary={
                compliance.isOverdue
                  ? m["attention.past_summary"]({ time: hoursPhrase(compliance.hoursRemaining), when: formatDistanceToNowStrict(record.arrestedAt, { addSuffix: true }), deadline: format(compliance.deadline, 'PP p') })
                  : m["attention.near_summary"]({ time: hoursPhrase(compliance.hoursRemaining), when: formatDistanceToNowStrict(record.arrestedAt, { addSuffix: true }), deadline: format(compliance.deadline, 'PP p') })
              }
              trailing={
                <>
                  <Tag tone={compliance.isOverdue ? 'urgent' : 'open'}>{compliance.isOverdue ? m["common.past_the_limit"]() : m["common.near_the_limit"]()}</Tag>
                  <Link to="/search/custody" className={openLink}>{m["common.custody"]()}</Link>
                </>
              }
            />
          ))}

          {referralsPending > 0 && (
            <Row
              aligned
              title={referralsPending === 1 ? m["attention.referral_one"]() : m["attention.referral_n"]({ count: referralsPending })}
              summary={m["attention.referral_summary"]()}
              trailing={<Link to="/referrals" className={openLink}>{m["common.referrals"]()}</Link>}
            />
          )}
        </RowList>
      )}
    </section>
  )
}
