import { ApiError } from '@/lib/api'
import { Badge } from '@pleadli/ui/badge'
import { Button } from '@pleadli/ui/button'
import { Switch } from '@pleadli/ui/switch'
import { t } from '@pleadli/ui/goey-toaster'
import { format } from 'date-fns/format'
import { useState } from 'react'
import { useCreateEnrolmentCode, useDevices, useEnvironment, useRevokeDevice, useSetNodeMode } from './queries'

/**
 * This machine as the facility's node (docs/prisons/product-map/04 I.3). The
 * node is the one place facility records live; workstations on the LAN use it
 * over TLS. To add a workstation: make an enrolment code here, then on the
 * workstation choose "Workstation of a facility node" and enter this
 * machine's address, the fingerprint below, and the code.
 */
export function NodePanel() {
  const { data: environment } = useEnvironment()
  const { data: devices } = useDevices()
  const setMode = useSetNodeMode()
  const createCode = useCreateEnrolmentCode()
  const revoke = useRevokeDevice()
  const [label, setLabel] = useState('')
  const [issued, setIssued] = useState<{ code: string; label: string; expiresAt: number } | null>(null)

  if (!environment) return null
  const { network } = environment
  const serving = network.mode === 'node'

  return (
    <div className="flex flex-col gap-6 md:max-w-none">
      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-4 rounded-lg border border-border bg-card p-4">
          <div className="flex flex-col gap-0.5">
            <span className="text-sm font-medium">Serve workstations on the facility network</span>
            <span className="text-xs text-muted-foreground">
              Other computers in this facility can then use this one’s records. Leave it off if this is the only computer.
            </span>
          </div>
          <Switch
            checked={serving}
            disabled={setMode.isPending}
            onCheckedChange={(serve) =>
              setMode.mutate(
                { serve, port: network.lanPort },
                { onError: (error) => t.error('Could not change that', { description: error instanceof ApiError ? error.message : undefined }) },
              )
            }
          />
        </div>

        {serving && (
          <div className="flex flex-col gap-2 rounded-lg border border-border bg-card p-4 text-xs">
            <div className="flex items-center gap-2">
              <span className="font-medium">Listener</span>
              {network.listening ? <Badge>Accepting connections</Badge> : <Badge variant="destructive">Not listening yet</Badge>}
            </div>
            <div className="flex flex-col gap-0.5">
              <span className="text-muted-foreground">Address for workstations</span>
              <span className="font-mono">{network.addresses.length > 0 ? network.addresses.join('   ') : `this computer's address, port ${network.lanPort}`}</span>
            </div>
            <div className="flex flex-col gap-0.5">
              <span className="text-muted-foreground">Fingerprint (a workstation must be given this)</span>
              <span className="break-all font-mono">{network.fingerprint ?? 'not generated yet'}</span>
            </div>
          </div>
        )}
      </section>

      {serving && (
        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-medium">Workstations</h2>
          <form
            className="flex gap-2"
            onSubmit={async (event) => {
              event.preventDefault()
              if (!label.trim()) return
              try {
                const code = await createCode.mutateAsync(label.trim())
                setIssued({ ...code, label: label.trim() })
                setLabel('')
              } catch (error) {
                t.error('Could not make a code', { description: error instanceof ApiError ? error.message : undefined })
              }
            }}
          >
            <input
              value={label}
              onChange={(event) => setLabel(event.target.value)}
              placeholder="Name this workstation, e.g. Registry PC"
              className="h-9 min-w-0 flex-1 rounded-md border border-border bg-background px-2.5 text-sm outline-none focus:border-primary"
            />
            <Button type="submit" disabled={!label.trim() || createCode.isPending}>
              Make enrolment code
            </Button>
          </form>

          {issued && (
            <div className="flex flex-col gap-1 rounded-lg border border-primary/40 bg-primary/5 p-3">
              <span className="text-xs text-muted-foreground">
                For {issued.label}. Works once, until {format(issued.expiresAt, 'p')}.
              </span>
              <span className="font-mono text-2xl tracking-widest">{issued.code}</span>
            </div>
          )}

          {(devices ?? []).length === 0 ? (
            <p className="text-xs text-muted-foreground">No workstations enrolled yet.</p>
          ) : (
            <div className="flex flex-col divide-y divide-border/60 rounded-lg border border-border">
              {devices?.map((device) => (
                <div key={device.id} className="flex items-center justify-between gap-3 px-3 py-2">
                  <div className="flex min-w-0 flex-col">
                    <span className="truncate text-xs font-medium">{device.label}</span>
                    <span className="truncate text-xs text-muted-foreground">
                      Enrolled {format(device.enrolledAt, 'PPp')}
                      {device.lastSeenAt ? ` · last seen ${format(device.lastSeenAt, 'PPp')}` : ''}
                    </span>
                  </div>
                  {device.revokedAt ? (
                    <Badge variant="secondary">Revoked</Badge>
                  ) : (
                    <Button size="xs" variant="secondary" disabled={revoke.isPending} onClick={() => revoke.mutate(device.id)}>
                      Revoke
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  )
}
