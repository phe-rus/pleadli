import * as m from '@/paraglide/messages'
import { useBackupRingtone } from '@/hooks/use-backup-ringtone'
import { Location01Icon, SirenIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Button } from '@pleadli/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@pleadli/ui/dialog'
import { t } from '@pleadli/ui/goey-toaster'
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@pleadli/ui/select'
import { isTauri } from '@tauri-apps/api/core'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { format } from '@/lib/date'
import { activeBackupAlertsOptions, officersOptions, useActiveBackupAlerts, useEndBackupAlert, useRespondToBackupAlert } from './queries'
import { backupAlertMapUrl, backupAlertStatus, type BackupAlert } from './schema'

function syncToast(alert: BackupAlert) {
  const status = backupAlertStatus(alert)
  if (status === 'ended') {
    t.dismiss(alert.id)
    return
  }
  const description =
    status === 'responding' ? m["backup.responding"]({ name: alert.responderName ?? '' }) : m["backup.needs"]({ name: alert.officerName })
  const push = status === 'responding' ? t.success : t
  push(m["backup.active_toast"](), { id: alert.id, description, duration: Number.POSITIVE_INFINITY })
}

/**
 * Mounted once in the toolbar (rendered on every route via
 * `SidebarProvider`), not inside any route file — the whole point is
 * that a backup dispatch stays visible and live no matter which page an
 * officer is looking at. Listens for `backup-alert:created`/`:updated`
 * Tauri events (emitted from `transport::remote_server` when a phone
 * calls for backup, and from the desktop respond/end commands), rings
 * until responded-to or ended, and shows a modal plus a persistent toast
 * for as long as the dispatch is active.
 */
export function BackupDispatchIndicator() {
  const queryClient = useQueryClient()
  const { data: activeAlerts = [] } = useActiveBackupAlerts()
  const { data: officers = [] } = useQuery(officersOptions())
  const respond = useRespondToBackupAlert()
  const end = useEndBackupAlert()
  const ring = useBackupRingtone()

  const [modalAlertId, setModalAlertId] = useState<string | null>(null)
  const [respondingOfficerId, setRespondingOfficerId] = useState('')

  useEffect(() => {
    if (!isTauri()) return
    let unlistenCreated: (() => void) | undefined
    let unlistenUpdated: (() => void) | undefined

    void (async () => {
      const { listen } = await import('@tauri-apps/api/event')

      unlistenCreated = await listen<BackupAlert>('backup-alert:created', (event) => {
        const alert = event.payload
        queryClient.setQueryData(activeBackupAlertsOptions().queryKey, (prev: BackupAlert[] = []) => [alert, ...prev])
        setModalAlertId(alert.id)
        syncToast(alert)
        ring.start()
      })

      unlistenUpdated = await listen<BackupAlert>('backup-alert:updated', (event) => {
        const alert = event.payload
        queryClient.setQueryData(activeBackupAlertsOptions().queryKey, (prev: BackupAlert[] = []) =>
          alert.endedAt ? prev.filter((a) => a.id !== alert.id) : prev.map((a) => (a.id === alert.id ? alert : a)),
        )
        syncToast(alert)
        if (alert.respondedAt || alert.endedAt) ring.stop()
      })
    })()

    return () => {
      unlistenCreated?.()
      unlistenUpdated?.()
    }
    // Deliberately only re-subscribing if the query client identity ever
    // changes (never, in practice) — `ring` is a stable set of callbacks
    // from a hook with no reactive state of its own.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryClient])

  const modalAlert = activeAlerts.find((a) => a.id === modalAlertId) ?? null
  const mapUrl = modalAlert ? backupAlertMapUrl(modalAlert) : null

  const handleRespond = async () => {
    if (!modalAlert || !respondingOfficerId) return
    try {
      await respond.mutateAsync({ id: modalAlert.id, officerId: respondingOfficerId })
      setRespondingOfficerId('')
    } catch {
      t.error(m["backup.dispatch_failed"](), { description: m["common.try_again"]() })
    }
  }

  const handleEnd = async (alertId: string) => {
    try {
      await end.mutateAsync(alertId)
      ring.stop()
      setModalAlertId(null)
    } catch {
      t.error(m["backup.end_failed"](), { description: m["common.try_again"]() })
    }
  }

  return (
    <>
      {activeAlerts.length > 0 && (
        <Button type="button" size="sm" variant="destructive" onClick={() => setModalAlertId(activeAlerts[0].id)}>
          <HugeiconsIcon icon={SirenIcon} />
          {activeAlerts.length === 1 ? m["backup.active_one"]() : m["backup.active_n"]({ count: activeAlerts.length })}
        </Button>
      )}

      <Dialog open={modalAlert != null} onOpenChange={(open) => !open && setModalAlertId(null)}>
        <DialogContent>
          {modalAlert && (
            <>
              <DialogHeader>
                <DialogTitle>{m["backup.requested_title"]()}</DialogTitle>
                <DialogDescription>{m["backup.requesting"]({ name: modalAlert.officerName })}</DialogDescription>
              </DialogHeader>

              <div className="flex flex-col gap-2 text-xs">
                <span className="text-muted-foreground">{m["backup.requested_at"]({ date: format(modalAlert.createdAt, 'PP p') })}</span>

                {mapUrl && (
                  <a
                    href={mapUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex w-fit items-center gap-1 text-primary underline"
                  >
                    <HugeiconsIcon icon={Location01Icon} className="size-3.5" />
                    {m["backup.view_location"]()}
                  </a>
                )}

                {modalAlert.responderName ? (
                  <span className="font-medium">{m["backup.responding_label"]({ name: modalAlert.responderName })}</span>
                ) : (
                  <div className="flex items-center gap-2">
                    <Select value={respondingOfficerId} onValueChange={(value) => value && setRespondingOfficerId(value)}>
                      <SelectTrigger size="sm" className="w-full">
                        <SelectValue placeholder={m["backup.dispatch_placeholder"]()} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          {officers.map((officer) => (
                            <SelectItem key={officer.id} value={officer.id}>
                              {officer.name}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                    <Button type="button" size="sm" onClick={handleRespond} disabled={!respondingOfficerId || respond.isPending}>
                      {m["backup.dispatch"]()}
                    </Button>
                  </div>
                )}
              </div>

              <DialogFooter>
                <Button type="button" size="sm" variant="destructive" onClick={() => handleEnd(modalAlert.id)} disabled={end.isPending}>
                  {m["backup.end"]()}
                </Button>
                <Button type="button" size="sm" variant="secondary" onClick={() => setModalAlertId(null)}>
                  {m["common.dismiss"]()}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
