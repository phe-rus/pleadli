import { SettingsCard } from '@/components/settings-card'
import { Tag } from '@/components/status-tag'
import { Button } from '@pleadli/ui/button'
import { formatDistanceToNowStrict } from 'date-fns/formatDistanceToNowStrict'
import { describeAction } from './schema'
import { useAudit, useVerification } from './queries'

/** Whether the record of what was done is whole. Every change is chained to the
 * one before it, so an entry taken out or altered breaks the chain at that
 * entry, and the check names it. */
export function IntegrityCard() {
  const { data: verdict, refetch, isFetching } = useVerification()
  const { data: recent } = useAudit(undefined, 12)

  return (
    <SettingsCard
      title="Record of activity"
      badge={verdict && (verdict.intact ? <Tag tone="done">Intact</Tag> : <Tag tone="urgent">Broken</Tag>)}
      description="Everything done here (a matter opened, a hearing closed, a document filed) is written to a chain that cannot be edited without the check below noticing."
      hint={
        verdict
          ? verdict.intact
            ? `${verdict.entries} ${verdict.entries === 1 ? 'entry' : 'entries'}, each one linked to the last.`
            : `The chain breaks at entry ${verdict.brokenAt}. Do not carry on as if it were whole. Keep this computer as it is and ask for help.`
          : 'Checking…'
      }
      action={
        <Button type="button" size="sm" variant="secondary" disabled={isFetching} onClick={() => void refetch()}>
          Check now
        </Button>
      }
    >
      {recent && recent.length > 0 && (
        <div role="list" className="flex flex-col divide-y divide-border/60 border-y border-border/60">
          {recent.map((entry) => (
            <div key={entry.seq} role="listitem" className="flex items-baseline justify-between gap-3 py-2">
              <p>{describeAction(entry.action)}</p>
              <p className="shrink-0 text-muted-foreground">
                {formatDistanceToNowStrict(entry.at, { addSuffix: true })}
                {entry.actor ? `, ${entry.actor}` : ''}
              </p>
            </div>
          ))}
        </div>
      )}
    </SettingsCard>
  )
}
