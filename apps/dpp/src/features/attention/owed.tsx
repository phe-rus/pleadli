import { useCapabilities } from '@/features/capabilities'
import { useGiveOut } from '@/features/registry/queries'
import { useSecurityStatus } from '@/features/security'
import { formatDate } from '@/lib/dates'
import * as m from '@/paraglide/messages'
import { Button } from '@pleadli/ui/button'
import { t } from '@pleadli/ui/goey-toaster'
import { cn } from '@pleadli/ui/lib/utils'
import { actionLabel, holderLabel, obligationLabel } from './present'
import type { Next } from './schema'

/** What a file needs, in full: the one line (what is next and who has it) and,
 * below it, everything else owed on the file now, each with its date and whether
 * it is for the person signed in. One next step never hides another duty. */
export function OwedOnFile({ next, fileId }: { next: Next; fileId: string }) {
  const caps = useCapabilities()
  const { data: status } = useSecurityStatus()
  const give = useGiveOut()
  if (next.action === 'closed') return null
  // The lead line already says the stage's own step; the list adds the rest.
  const rest = next.obligations.filter((o) => o.kind === 'hearing' || o.kind === 'time_limit' || o.kind === 'task' || o.kind === 'police_reply')
  const me = status?.actor
  return (
    <section aria-label={m['attn.also_owed']()} className="flex flex-col gap-2">
      <p className="text-base">
        <span className="font-semibold">{actionLabel(next)}</span>
        <span className="text-muted-foreground">
          {' · '}
          {next.needsMe ? m['attn.needs_you']() : holderLabel(next)}
        </span>
        {next.canTake && me && caps.selfAssign && (
          <Button
            size="sm"
            variant="outline"
            className="ms-3 align-middle"
            disabled={give.isPending}
            onClick={() => give.mutate({ prosecutionFileId: fileId, staffId: me.id }, { onSuccess: () => t.success(m['attn.taken']()), onError: (e) => t.error(m['attn.give_failed'](), { description: e.message }) })}
          >
            {m['attn.take']()}
          </Button>
        )}
      </p>
      {rest.length > 0 && (
        <div className="flex flex-col gap-1">
          <h3 className="text-xs font-medium text-muted-foreground">{m['attn.also_owed']()}</h3>
          <ul className="m-0 flex list-none flex-col divide-y divide-border/60 p-0">
            {rest.map((o, i) => (
              <li key={`${o.kind}-${i}`} className="flex items-baseline gap-3 py-1.5 text-sm">
                <span className={cn('min-w-0 flex-1 truncate', o.overdue && 'text-destructive')}>{obligationLabel(o)}</span>
                {o.dueAt != null && <span className="shrink-0 text-xs text-muted-foreground">{o.overdue ? m['attn.overdue']() : m['attn.due']({ date: formatDate(o.dueAt) })}</span>}
                <span className={cn('shrink-0 text-xs', o.mine ? 'font-medium text-foreground' : 'text-muted-foreground')}>{o.mine ? m['attn.owed_mine']() : m['attn.owed_other']()}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}
