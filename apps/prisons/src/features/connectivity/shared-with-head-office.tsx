import { ApiError } from '@/lib/api'
import { Badge } from '@pleadli/ui/badge'
import { Button } from '@pleadli/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@pleadli/ui/dialog'
import { t } from '@pleadli/ui/goey-toaster'
import { Switch } from '@pleadli/ui/switch'
import { useState } from 'react'
import { useConnectivityStatus, useDisconnectFromHeadOffice, useSetSyncClass } from './queries'
import { m } from '@/paraglide/messages'

/** What this facility exchanges with Head Office, one line each, with a
 * switch and what is waiting. The boundary of what leaves the facility is
 * always this list: nothing else is sent. */
export function SharedWithHeadOffice({ canManage }: { canManage: boolean }) {
  const { data: status } = useConnectivityStatus()
  const setClass = useSetSyncClass()
  if (!status) return null

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h2>{m.connectivity_what_head_office_receives()}</h2>
        <p >{m.connectivity_connected_does_not_mean_everything_is()}</p>
      </div>
      <ul className="flex flex-col divide-y divide-border/40">
        {status.classes.map((item) => (
          <li key={item.class} className="flex items-start justify-between gap-4 py-3">
            <div className="flex min-w-0 flex-col gap-0.5">
              <h3 className="flex items-center gap-2">
                {item.label}
                <Badge variant="secondary">{item.direction === 'up' ? m.connectivity_sent() : m.connectivity_received()}</Badge>
                {item.enabled && item.pending > 0 && <Badge variant="outline">{m.connectivity_waiting({ pending: item.pending })}</Badge>}
              </h3>
              <p>{item.description}</p>
            </div>
            <Switch
              aria-label={`${item.label}: ${item.enabled ? 'on' : 'off'}`}
              checked={item.enabled}
              disabled={!canManage || setClass.isPending}
              onCheckedChange={(enabled) =>
                setClass.mutate(
                  { class: item.class, enabled },
                  { onError: (error) => t.error(m.connectivity_could_not_change_this(), { description: error instanceof ApiError ? error.message : m.connectivity_please_try_again() }) },
                )
              }
            />
          </li>
        ))}
      </ul>
    </section>
  )
}

/** Ends the link to Head Office. Says exactly what stays and what goes. */
export function DisconnectFromHeadOffice() {
  const [open, setOpen] = useState(false)
  const disconnect = useDisconnectFromHeadOffice()

  return (
    <section className="flex flex-col gap-2">
      <h2>{m.connectivity_disconnect()}</h2>
      <p >
        {m.connectivity_stops_this_facility_exchanging_anything()}
      </p>
      <div>
        <Button variant="destructive" size="sm" onClick={() => setOpen(true)}>
          {m.connectivity_disconnect_from_head_office()}
        </Button>
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{m.connectivity_disconnect_from_head_office_2()}</DialogTitle>
            <DialogDescription>
              {m.connectivity_local_prison_work_carries_on_as()}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              {m.connectivity_stay_connected()}
            </Button>
            <Button
              variant="destructive"
              disabled={disconnect.isPending}
              onClick={() =>
                disconnect.mutate(undefined, {
                  onSuccess: () => {
                    setOpen(false)
                    t.success(m.connectivity_disconnected_from_head_office(), { description: m.connectivity_local_prison_work_is_unchanged() })
                  },
                  onError: (error) => t.error(m.connectivity_could_not_disconnect(), { description: error instanceof ApiError ? error.message : m.connectivity_please_try_again() }),
                })
              }
            >
              {m.connectivity_disconnect()}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  )
}
