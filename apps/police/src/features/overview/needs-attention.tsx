import { EmptyNote } from '@/components/planned'
import { Row, RowList } from '@/components/operational-row'
import { Tag } from '@/components/status-tag'
import { custodyCompliance, custodyPersonName, type CustodyRecord } from '@/features/custody/schema'
import { Link } from '@tanstack/react-router'
import { format } from 'date-fns/format'
import { formatDistanceToNowStrict } from 'date-fns/formatDistanceToNowStrict'

/** A person in custody is listed here once the record puts them within this
 * many hours of the limit, or past it. Everyone else in the cells is on the
 * custody board, ordered by the same deadline. */
const LISTED_WITHIN_HOURS = 12

const openLink = 'text-primary'

function hoursPhrase(hours: number) {
  const abs = Math.abs(hours)
  if (abs < 1) return `${Math.max(1, Math.round(abs * 60))} minutes`
  return `${Math.round(abs)} ${Math.round(abs) === 1 ? 'hour' : 'hours'}`
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
        <h2 id="attention">Needs attention</h2>
        {count > 0 && <Tag tone="open">{count === 1 ? '1 item' : `${count} items`}</Tag>}
      </div>

      {count === 0 ? (
        <EmptyNote>Nothing needs attention. No one in custody is near the limit and no referral is waiting.</EmptyNote>
      ) : (
        <RowList>
          {due.map(({ record, compliance }) => (
            <Row
              key={record.id}
              marker={compliance.isOverdue ? 'urgent' : 'open'}
              title={custodyPersonName(record)}
              summary={
                compliance.isOverdue
                  ? `Past the limit by ${hoursPhrase(compliance.hoursRemaining)}. Arrested ${formatDistanceToNowStrict(record.arrestedAt, { addSuffix: true })}. The limit was ${format(compliance.deadline, 'PP p')}.`
                  : `${hoursPhrase(compliance.hoursRemaining)} left. Arrested ${formatDistanceToNowStrict(record.arrestedAt, { addSuffix: true })}. The limit is ${format(compliance.deadline, 'PP p')}.`
              }
              trailing={
                <>
                  <Tag tone={compliance.isOverdue ? 'urgent' : 'open'}>{compliance.isOverdue ? 'Past the limit' : 'Near the limit'}</Tag>
                  <Link to="/search/custody" className={openLink}>Custody</Link>
                </>
              }
            />
          ))}

          {referralsPending > 0 && (
            <Row
              aligned
              title={referralsPending === 1 ? '1 referral has no outcome yet' : `${referralsPending} referrals have no outcome yet`}
              summary="Record what came back, or follow it up with the office it was sent to."
              trailing={<Link to="/referrals" className={openLink}>Referrals</Link>}
            />
          )}
        </RowList>
      )}
    </section>
  )
}
