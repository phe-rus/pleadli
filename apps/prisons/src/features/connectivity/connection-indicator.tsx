import { useHqConfig } from '@/features/session'
import { cn } from '@pleadli/ui/lib/utils'
import { Popover, PopoverContent, PopoverTrigger } from '@pleadli/ui/popover'
import { useNavigate } from '@tanstack/react-router'
import { formatDistanceToNow } from 'date-fns/formatDistanceToNow'
import { useConnectivityStatus } from './queries'
import { stateCopy, transportLabel, type ConnectivityStatus } from './schema'
import { m } from '@/paraglide/messages'

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{value}</span>
    </div>
  )
}

function pendingText(status: ConnectivityStatus) {
  const { total } = status.pending
  if (status.neverSynced && status.state !== 'offline') return m.connectivity_the_first_exchange_is_still_to()
  return total === 0 ? m.connectivity_nothing_waiting() : total === 1 ? '1 change waiting' : m.connectivity_changes_waiting({ total })
}

/** The connection to Head Office as one dot and one word in the status bar.
 * It says what is true, quietly, and the popover says a little more without
 * ever suggesting local work is affected. Absent on Head Office, which has
 * nothing above it. */
export function ConnectionIndicator() {
  const navigate = useNavigate()
  const { data: config } = useHqConfig()
  const { data: status } = useConnectivityStatus(config != null && !config.isHeadOffice)
  if (!config || config.isHeadOffice || !status) return null
  const copy = stateCopy[status.state]
  const linked = status.state !== 'not_connected' && status.state !== 'disconnected'

  return (
    <Popover>
      <PopoverTrigger
        render={
          <button
            type="button"
            aria-label={m.connectivity_head_office_connection({ label: copy.label })}
            className="flex cursor-pointer items-center gap-1.5 rounded-sm px-1 outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
          />
        }
      >
        <span className={cn('size-2 rounded-full', copy.dot)} aria-hidden />
        {copy.label}
      </PopoverTrigger>
      <PopoverContent side="top" align="end" className="w-72 gap-3">
        <div className="flex flex-col gap-1">
          <span className="text-sm font-medium">{m.connectivity_head_office()}</span>
          <span className="text-xs text-muted-foreground">{copy.sentence}</span>
        </div>
        {linked && (
          <div className="flex flex-col gap-1.5 border-t border-border/40 pt-3">
            <Row label={m.connectivity_last_exchange()} value={status.lastExchangeAt ? formatDistanceToNow(status.lastExchangeAt, { addSuffix: true }) : m.connectivity_not_yet()} />
            <Row label={m.connectivity_pending()} value={pendingText(status)} />
            <Row label={m.connectivity_network()} value={transportLabel[status.transport]} />
          </div>
        )}
        <button
          type="button"
          onClick={() => void navigate({ to: '/settings/$section', params: { section: 'head-office' } })}
          className="w-fit cursor-pointer text-xs text-primary underline-offset-2 hover:underline"
        >
          {m.connectivity_open_connection_settings()}
        </button>
      </PopoverContent>
    </Popover>
  )
}
