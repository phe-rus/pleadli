import * as m from '@/paraglide/messages'
import { EmptyNote } from '@/components/planned'
import { Row, RowList } from '@/components/operational-row'
import { Tag } from '@/components/status-tag'
import { Button } from '@pleadli/ui/button'
import { format } from '@/lib/date'
import { formatDistanceToNowStrict } from '@/lib/date'
import { custodyBasisLabel, custodyCompliance, custodyPersonName, type CustodyRecord } from './schema'

/** Past this many hours before the limit a row is marked as needing action. */
const NEAR_HOURS = 6

function remaining(hours: number) {
  const abs = Math.abs(hours)
  if (abs < 1) return m["custody.minutes"]({ count: Math.max(1, Math.round(abs * 60)) })
  if (abs < 48) return Math.round(abs) === 1 ? m["custody.hour_one"]() : m["custody.hours"]({ count: Math.round(abs) })
  const days = Math.floor(abs / 24)
  const rest = Math.round(abs - days * 24)
  const dayText = days === 1 ? m["custody.day_one"]() : m["custody.days"]({ count: days })
  return rest > 0 ? m["custody.and_hours"]({ days: dayText, hours: rest }) : dayText
}

/** Who is in the cells, ordered by the deadline the record itself fixes, the
 * soonest first. The limit is computed from the timestamps every time this is
 * drawn and stored nowhere. Nothing is marked urgent that is not past or near
 * that limit. */
export function CustodyBoard({ records, onOpen }: { records: CustodyRecord[]; onOpen: (record: CustodyRecord) => void }) {
  const inCells = records
    .filter((record) => record.status === 'in_custody')
    .map((record) => ({ record, compliance: custodyCompliance(record) }))
    .sort((a, b) => a.compliance.deadline - b.compliance.deadline)

  if (inCells.length === 0) return <EmptyNote>{m["custody.nobody"]()}</EmptyNote>

  return (
    <RowList>
      {inCells.map(({ record, compliance }) => {
        const past = compliance.isOverdue
        const near = !past && compliance.hoursRemaining <= NEAR_HOURS
        return (
          <Row
            key={record.id}
            marker={past ? 'urgent' : near ? 'open' : undefined}
            aligned
            title={custodyPersonName(record)}
            summary={
              <>
                {m["custody.arrested_summary"]({ when: formatDistanceToNowStrict(record.arrestedAt, { addSuffix: true }) })}
                {record.location ? m["custody.at_location"]({ location: record.location }) : ''}
                {record.caseReference ? m["custody.case_ref"]({ reference: record.caseReference }) : ''}
                {m["custody.limit_summary"]({ deadline: format(compliance.deadline, 'PP p'), basis: custodyBasisLabel(compliance.basis) })}
              </>
            }
            trailing={
              <>
                <Tag tone={past ? 'urgent' : near ? 'open' : 'neutral'}>{past ? m["custody.past_by"]({ time: remaining(compliance.hoursRemaining) }) : m["custody.left"]({ time: remaining(compliance.hoursRemaining) })}</Tag>
                <Button size="sm" variant="secondary" onClick={() => onOpen(record)} className="cursor-pointer">
                  {m["common.open"]()}
                </Button>
              </>
            }
          />
        )
      })}
    </RowList>
  )
}
