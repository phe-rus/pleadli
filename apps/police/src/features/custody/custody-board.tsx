import { EmptyNote } from '@/components/planned'
import { Row, RowList } from '@/components/operational-row'
import { Tag } from '@/components/status-tag'
import { Button } from '@pleadli/ui/button'
import { format } from 'date-fns/format'
import { formatDistanceToNowStrict } from 'date-fns/formatDistanceToNowStrict'
import { custodyBasisLabel, custodyCompliance, custodyPersonName, type CustodyRecord } from './schema'

/** Past this many hours before the limit a row is marked as needing action. */
const NEAR_HOURS = 6

function remaining(hours: number) {
  const abs = Math.abs(hours)
  if (abs < 1) return `${Math.max(1, Math.round(abs * 60))} minutes`
  if (abs < 48) return `${Math.round(abs)} ${Math.round(abs) === 1 ? 'hour' : 'hours'}`
  const days = Math.floor(abs / 24)
  const rest = Math.round(abs - days * 24)
  return `${days} ${days === 1 ? 'day' : 'days'}${rest > 0 ? ` ${rest} h` : ''}`
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

  if (inCells.length === 0) return <EmptyNote>No one is recorded in custody.</EmptyNote>

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
                Arrested {formatDistanceToNowStrict(record.arrestedAt, { addSuffix: true })}
                {record.location ? ` at ${record.location}` : ''}
                {record.caseReference ? `. Case ${record.caseReference}` : ''}. Limit {format(compliance.deadline, 'PP p')}, {custodyBasisLabel(compliance.basis)}.
              </>
            }
            trailing={
              <>
                <Tag tone={past ? 'urgent' : near ? 'open' : 'neutral'}>{past ? `Past the limit by ${remaining(compliance.hoursRemaining)}` : `${remaining(compliance.hoursRemaining)} left`}</Tag>
                <Button size="sm" variant="secondary" onClick={() => onOpen(record)} className="cursor-pointer">
                  Open
                </Button>
              </>
            }
          />
        )
      })}
    </RowList>
  )
}
