import * as m from '@/paraglide/messages'
import { Button } from '@pleadli/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@pleadli/ui/dialog'
import { useNavigate } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { custodyRecordsOptions } from './queries'
import { custodyBasisLabel, custodyCompliance, custodyPersonName, type CustodyRecord } from './schema'

const RECHECK_MS = 60_000

/**
 * Mounted once in the toolbar (same reasoning as BackupDispatchIndicator:
 * live from any route, not just Overview). The one real "needs immediate
 * attention right now" condition in the product today outside Backup
 * Requests — a custody record at or approaching the 48h/7d constitutional
 * deadline (docs/police/PRODUCT.md). Overview's own banner is passive and
 * only visible on that one route; this makes sure an officer working
 * anywhere else doesn't miss it. Uses `useQuery`, not the feature's own
 * suspense-based `useCustodyRecords`, so mounting this at the shell level
 * can never suspend the whole app — same fix already applied to
 * `BackupDispatchIndicator`'s officer list.
 *
 * Dismissing shows it once per record per session (tracked in a ref, not
 * persisted) — it doesn't resolve the underlying compliance issue, which
 * Overview's banner and Cell Lock-up both keep showing regardless; this
 * just stops re-interrupting for the same record every recheck.
 */
export function CustodyAttentionDialog() {
  const { data: records = [] } = useQuery(custodyRecordsOptions(''))
  const navigate = useNavigate()
  const shown = useRef<Set<string>>(new Set())
  const [dialogRecord, setDialogRecord] = useState<CustodyRecord | null>(null)
  const [, forceRecheck] = useState(0)

  useEffect(() => {
    const id = setInterval(() => forceRecheck((n) => n + 1), RECHECK_MS)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    const urgent = records
      .filter((r) => r.status === 'in_custody' && !shown.current.has(r.id))
      .find((r) => {
        const compliance = custodyCompliance(r)
        return compliance.isOverdue || compliance.hoursRemaining < 6
      })
    if (urgent) {
      shown.current.add(urgent.id)
      setDialogRecord(urgent)
    }
    // Deliberately only re-running when the record list itself changes or
    // the recheck timer ticks — `navigate` is stable, `shown` is a ref.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [records])

  const compliance = dialogRecord ? custodyCompliance(dialogRecord) : null

  return (
    <Dialog open={dialogRecord != null} onOpenChange={(open) => !open && setDialogRecord(null)}>
      <DialogContent>
        {dialogRecord && compliance && (
          <>
            <DialogHeader>
              <DialogTitle>{m["custody.limit_title"]()}</DialogTitle>
              <DialogDescription>
                {compliance.isOverdue
                  ? m["custody.past_limit"]({ name: custodyPersonName(dialogRecord) })
                  : m["custody.approaching_limit"]({ name: custodyPersonName(dialogRecord) })}
              </DialogDescription>
            </DialogHeader>

            <p className="text-xs text-muted-foreground">
              {compliance.isOverdue
                ? m["common.hours_overdue"]({ hours: Math.abs(compliance.hoursRemaining).toFixed(1) })
                : m["common.hours_remaining"]({ hours: compliance.hoursRemaining.toFixed(1) })}
              {' · '}
              {custodyBasisLabel(compliance.basis)}
            </p>

            <DialogFooter>
              <Button
                type="button"
                size="sm"
                onClick={() => {
                  navigate({ to: '/search/custody', search: { open: dialogRecord.id } })
                  setDialogRecord(null)
                }}
              >
                {m["custody.review_record"]()}
              </Button>
              <Button type="button" size="sm" variant="secondary" onClick={() => setDialogRecord(null)}>
                {m["common.dismiss"]()}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
