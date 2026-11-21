import * as m from '@/paraglide/messages'
import { SettingsCard } from '@/components/settings-card'
import { Tag } from '@/components/status-tag'
import { Button } from '@pleadli/ui/button'
import { formatInstant } from '@pleadli/ui/lib/institution-zone'
import { useState } from 'react'
import { useAudit, useVerification } from './queries'
import { describeAction } from './schema'

const PAGE = 25

/** Whether the record of what was done is whole, and the newest of it. Every entry is chained to the one
 * before it, so one taken out or altered breaks the chain at that entry, and the check names it. */
export function IntegrityCard() {
  const [limit, setLimit] = useState(PAGE)
  const { data: verdict, refetch, isFetching } = useVerification()
  const { data: recent } = useAudit(limit)

  return (
    <SettingsCard
      title={m['audit.check_title']()}
      badge={verdict && (verdict.intact ? <Tag tone="done">{m['audit.intact']()}</Tag> : <Tag tone="urgent">{m['audit.broken']()}</Tag>)}
      hint={
        verdict
          ? verdict.intact
            ? verdict.entries === 1
              ? m['audit.count_one']()
              : m['audit.count_many']({ count: verdict.entries })
            : <span role="alert" className="text-destructive">{m['audit.broken_at']({ seq: verdict.brokenAt ?? 0 })}</span>
          : m['audit.checking']()
      }
      action={
        <Button type="button" size="sm" variant="secondary" disabled={isFetching} onClick={() => void refetch()}>
          {m['audit.check_now']()}
        </Button>
      }
    >
      {recent && recent.length === 0 && <p className="text-muted-foreground">{m['audit.empty']()}</p>}
      {recent && recent.length > 0 && (
        <div role="list" className="flex flex-col divide-y divide-border/60 border-y border-border/60">
          {recent.map((entry) => (
            <div key={entry.seq} role="listitem" className="flex items-baseline justify-between gap-3 py-2">
              <p>{describeAction(entry.action)}</p>
              <p className="shrink-0 text-muted-foreground tabular-nums">
                {formatInstant(entry.at)} · {entry.actor ?? m['audit.by_nobody']()}
              </p>
            </div>
          ))}
        </div>
      )}
      {recent && recent.length >= limit && (
        <div className="flex justify-center py-2.5!">
          <Button type="button" size="sm" variant="ghost" onClick={() => setLimit((n) => n + PAGE)}>
            {m['audit.more']()}
          </Button>
        </div>
      )}
    </SettingsCard>
  )
}
