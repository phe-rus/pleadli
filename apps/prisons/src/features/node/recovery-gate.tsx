import { PreAuthLayout, ScreenHeader, screenTransition } from '@/components/pre-auth-layout'
import { ApiError } from '@/lib/api'
import { Alert02Icon } from '@hugeicons/core-free-icons'
import { Button } from '@pleadli/ui/button'
import { t } from '@pleadli/ui/goey-toaster'
import { format } from 'date-fns/format'
import { motion } from 'framer-motion'
import { useState, type ReactNode } from 'react'
import { restartApp } from './data'
import { useRecoveryBackups, useRecoveryStatus, useRestoreInRecovery } from './queries'
import { formatBytes, type BackupInfo } from './schema'

/**
 * When the node finds its database untrustworthy at startup it does not open
 * it for work and serves only the recovery router (docs/prisons/product-map/
 * 03 L.4, state 9). This screen is the whole application in that state: it
 * says what is wrong, finds backups, and restores one. The corrupt database
 * is moved aside, never deleted.
 */
export function RecoveryGate({ children }: { children: ReactNode }) {
  const { data, isLoading, isError } = useRecoveryStatus()
  if (isLoading) return null
  if (isError || !data?.recovering) return <>{children}</>
  return <RecoveryScreen reason={data.reason ?? 'The database could not be trusted.'} defaultDir={data.defaultBackupDir ?? ''} />
}

function RecoveryScreen({ reason, defaultDir }: { reason: string; defaultDir: string }) {
  const [dir, setDir] = useState(defaultDir)
  const [backups, setBackups] = useState<BackupInfo[] | null>(null)
  const [chosen, setChosen] = useState<BackupInfo | null>(null)
  const [passphrase, setPassphrase] = useState('')
  const [staged, setStaged] = useState(false)
  const list = useRecoveryBackups()
  const restore = useRestoreInRecovery()

  return (
    <PreAuthLayout>
      <motion.div {...screenTransition} className="flex w-full max-w-lg flex-col gap-6">
        <ScreenHeader
          icon={Alert02Icon}
          title="This installation needs recovery"
          description="The database failed its safety check, so nothing has been opened or changed. Restore a backup to continue. The damaged database is kept aside, not deleted."
        />
        <p className="rounded-md border border-border bg-muted/40 p-3 font-mono text-xs text-muted-foreground">{reason}</p>

        {staged ? (
          <div className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4">
            <p className="text-sm">
              The backup checked out and is ready. Restart the application to finish: it swaps the database in before anything opens.
            </p>
            <Button onClick={() => restartApp()}>Restart now</Button>
          </div>
        ) : (
          <div className="flex flex-col gap-4 rounded-lg border border-border bg-card p-4">
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-medium">Backup folder</span>
              <div className="flex gap-2">
                <input
                  value={dir}
                  onChange={(event) => setDir(event.target.value)}
                  className="h-9 min-w-0 flex-1 rounded-md border border-border bg-background px-2.5 font-mono text-xs outline-none focus:border-primary"
                />
                <Button
                  type="button"
                  variant="secondary"
                  disabled={list.isPending}
                  onClick={async () => {
                    try {
                      setBackups(await list.mutateAsync(dir.trim() || null))
                      setChosen(null)
                    } catch {
                      setBackups([])
                      t.error('That folder could not be read')
                    }
                  }}
                >
                  Find backups
                </Button>
              </div>
            </label>

            {backups && backups.length === 0 && <p className="text-xs text-muted-foreground">No Pleadli backups found in that folder.</p>}
            {backups && backups.length > 0 && (
              <div className="flex flex-col gap-1.5">
                {backups.map((backup) => (
                  <button
                    key={backup.path}
                    type="button"
                    onClick={() => setChosen(backup)}
                    className={`flex items-center justify-between rounded-md border px-3 py-2 text-left text-xs ${
                      chosen?.path === backup.path ? 'border-primary bg-primary/5' : 'border-border'
                    }`}
                  >
                    <span className="truncate">{format(backup.createdAt, 'PPp')}</span>
                    <span className="shrink-0 text-muted-foreground">{formatBytes(backup.sizeBytes)}</span>
                  </button>
                ))}
              </div>
            )}

            {chosen && (
              <form
                className="flex flex-col gap-3"
                onSubmit={async (event) => {
                  event.preventDefault()
                  try {
                    await restore.mutateAsync({ path: chosen.path, passphrase })
                    setStaged(true)
                  } catch (error) {
                    t.error('Could not use that backup', { description: error instanceof ApiError ? error.message : 'Please try again.' })
                  }
                }}
              >
                <label className="flex flex-col gap-1.5">
                  <span className="text-xs font-medium">Recovery passphrase</span>
                  <input
                    type="password"
                    autoFocus
                    value={passphrase}
                    onChange={(event) => setPassphrase(event.target.value)}
                    className="h-9 w-full rounded-md border border-border bg-background px-2.5 text-sm outline-none focus:border-primary"
                  />
                </label>
                <Button type="submit" disabled={passphrase.length === 0 || restore.isPending}>
                  {restore.isPending ? 'Checking the backup…' : 'Check and restore'}
                </Button>
              </form>
            )}
          </div>
        )}
      </motion.div>
    </PreAuthLayout>
  )
}
