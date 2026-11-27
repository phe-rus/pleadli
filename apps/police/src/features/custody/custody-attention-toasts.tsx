import * as m from '@/paraglide/messages'
import { t } from '@pleadli/ui/goey-toaster'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'
import { custodyRecordsOptions } from './queries'
import { custodyBasisLabel, custodyCompliance, custodyPersonName } from './schema'

const RECHECK_MS = 5 * 60_000
const APPROACHING_HOURS = 6
const TOLD_KEY = 'pleadli:custody-toasts-told'

type Stage = 'overdue' | 'approaching'

function readTold(): Set<string> {
  try {
    return new Set<string>(JSON.parse(localStorage.getItem(TOLD_KEY) ?? '[]'))
  } catch {
    return new Set()
  }
}
function writeTold(told: Set<string>) {
  try {
    localStorage.setItem(TOLD_KEY, JSON.stringify([...told].slice(-500)))
  } catch {
    // A preference only: worst case a record is told once more.
  }
}

/**
 * Mounted once in the toolbar, live from any route. A custody record at or
 * near the 48h/7d constitutional deadline (docs/police/PRODUCT.md) is told to
 * the officer as a toast, never a modal.
 *
 * It must never flood: each record is told once per stage, remembered across
 * restarts, and everything new in one check is ONE toast (a single record
 * names the person; several say how many and open the cells). The standing
 * signal is the status bar reading and the Cells desk, which stay until the
 * record is resolved.
 */
export function CustodyAttentionToasts() {
  const { data: records = [] } = useQuery(custodyRecordsOptions(''))
  const navigate = useNavigate()
  const told = useRef<Set<string>>(readTold())
  const [tick, setTick] = useState(0)

  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), RECHECK_MS)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    const fresh: { record: (typeof records)[number]; stage: Stage }[] = []
    for (const record of records) {
      if (record.status !== 'in_custody') continue
      const compliance = custodyCompliance(record)
      const stage: Stage | null = compliance.isOverdue ? 'overdue' : compliance.hoursRemaining < APPROACHING_HOURS ? 'approaching' : null
      if (!stage || told.current.has(`${record.id}:${stage}`)) continue
      fresh.push({ record, stage })
    }
    if (fresh.length === 0) return
    for (const { record, stage } of fresh) told.current.add(`${record.id}:${stage}`)
    writeTold(told.current)

    const overdue = fresh.filter((f) => f.stage === 'overdue')
    const approaching = fresh.filter((f) => f.stage === 'approaching')

    const tell = (group: typeof fresh, stage: Stage) => {
      if (group.length === 0) return
      const show = stage === 'overdue' ? t.error : t.warning
      const duration = stage === 'overdue' ? 30_000 : 15_000
      if (group.length === 1) {
        const { record } = group[0]
        const compliance = custodyCompliance(record)
        const name = custodyPersonName(record)
        const hours = compliance.isOverdue
          ? m["common.hours_overdue"]({ hours: Math.abs(compliance.hoursRemaining).toFixed(1) })
          : m["common.hours_remaining"]({ hours: compliance.hoursRemaining.toFixed(1) })
        show(stage === 'overdue' ? m["custody.past_limit"]({ name }) : m["custody.approaching_limit"]({ name }), {
          id: `custody-${stage}`,
          description: `${hours} · ${custodyBasisLabel(compliance.basis)}`,
          duration,
          action: { label: m["custody.review_record"](), onClick: () => navigate({ to: '/search/custody', search: { open: record.id } }) },
        })
      } else {
        show(stage === 'overdue' ? m["custody.many_past_limit"]({ count: group.length }) : m["custody.many_approaching"]({ count: group.length }), {
          id: `custody-${stage}`,
          duration,
          action: { label: m["custody.open_cells"](), onClick: () => navigate({ to: '/search/custody', search: {} }) },
        })
      }
    }
    tell(overdue, 'overdue')
    tell(approaching, 'approaching')
    // `navigate` is stable and `told` is a ref.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [records, tick])

  return null
}
