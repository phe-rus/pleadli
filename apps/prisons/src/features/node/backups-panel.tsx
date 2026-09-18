import { ApiError } from '@/lib/api'
import { useAppForm } from '@pleadli/forms-tables/forms'
import { Badge } from '@pleadli/ui/badge'
import { Button } from '@pleadli/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@pleadli/ui/dialog'
import { t } from '@pleadli/ui/goey-toaster'
import { format } from 'date-fns/format'
import { useState } from 'react'
import { restartApp } from './data'
import { useBackups, useRestoreBackup, useRunBackup, useSaveBackupConfig, useVerifyBackup } from './queries'
import { formatBytes, type BackupInfo } from './schema'

type Action = { kind: 'verify' | 'restore'; backup: BackupInfo }

/**
 * Backups for this node (docs/prisons/product-map/04 W17). A backup is one
 * encrypted file with the database and every document in it. The recovery
 * passphrase is kept offline by the Officer in Charge: without it a backup
 * cannot be opened, and it is never stored on this machine, only a key
 * derived from it so scheduled backups can run unattended.
 */
export function BackupsPanel() {
  const { data } = useBackups()
  const runBackup = useRunBackup()
  const [action, setAction] = useState<Action | null>(null)

  if (!data) return null
  const { config, backups } = data

  return (
    <div className="flex flex-col gap-6 md:max-w-2xl">
      <section className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-3">
          <div className="flex flex-col gap-0.5">
            <h2 className="text-sm font-medium">Backups</h2>
            <p className="text-xs text-muted-foreground">
              {!config.configured
                ? 'No backups are being made. Set a recovery passphrase below to start.'
                : config.lastBackupAt
                  ? `Last backup ${format(config.lastBackupAt, 'PPp')}. Every ${config.backupIntervalHours} hours, keeping ${config.backupRetention}.`
                  : `Backs up every ${config.backupIntervalHours} hours, keeping ${config.backupRetention}. None made yet.`}
            </p>
          </div>
          <Button
            size="sm"
            disabled={!config.configured || runBackup.isPending}
            onClick={() =>
              runBackup.mutate(undefined, {
                onSuccess: (info) => t.success('Backup written', { description: `${info.fileName} (${formatBytes(info.sizeBytes)})` }),
                onError: (error) => t.error('Backup failed', { description: error instanceof ApiError ? error.message : 'Please try again.' }),
              })
            }
          >
            {runBackup.isPending ? 'Backing up…' : 'Back up now'}
          </Button>
        </div>

        {config.lastBackupStatus === 'error' && (
          <p className="rounded-md border border-destructive/40 bg-destructive/5 p-2 text-xs text-destructive">
            The last backup failed{config.lastBackupError ? `: ${config.lastBackupError}` : '.'}
          </p>
        )}
        <p className="text-xs text-muted-foreground">
          Folder: <span className="font-mono">{config.effectiveDir}</span>
          {config.backupDir == null && ' (the default, on this same disk: choose a folder on another drive so a failed disk does not take the backups with it)'}
        </p>

        {backups.length === 0 ? (
          <p className="text-xs text-muted-foreground">No backups in that folder yet.</p>
        ) : (
          <div className="flex flex-col divide-y divide-border/60 rounded-lg border border-border">
            {backups.map((backup) => (
              <div key={backup.path} className="flex items-center justify-between gap-3 px-3 py-2">
                <div className="flex min-w-0 flex-col">
                  <span className="truncate text-xs font-medium">{format(backup.createdAt, 'PPp')}</span>
                  <span className="truncate text-xs text-muted-foreground">
                    {backup.fileName} · {formatBytes(backup.sizeBytes)}
                  </span>
                </div>
                <div className="flex shrink-0 gap-1.5">
                  <Button size="xs" variant="secondary" onClick={() => setAction({ kind: 'verify', backup })}>
                    Verify
                  </Button>
                  <Button size="xs" variant="secondary" onClick={() => setAction({ kind: 'restore', backup })}>
                    Restore
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <ConfigForm />
      <ActionDialog action={action} onClose={() => setAction(null)} />
    </div>
  )
}

function ConfigForm() {
  const { data } = useBackups()
  const save = useSaveBackupConfig()
  const config = data?.config

  const form = useAppForm({
    defaultValues: {
      backupDir: config?.backupDir ?? '',
      intervalHours: String(config?.backupIntervalHours ?? 24),
      retention: String(config?.backupRetention ?? 14),
      passphrase: '',
    },
    onSubmit: async ({ value, formApi }) => {
      try {
        await save.mutateAsync({
          backupDir: value.backupDir.trim() || null,
          intervalHours: Number(value.intervalHours),
          retention: Number(value.retention),
          passphrase: value.passphrase || null,
        })
        formApi.setFieldValue('passphrase', '')
        t.success('Backup settings saved')
      } catch (error) {
        t.error('Could not save', { description: error instanceof ApiError ? error.message : 'Check the values and try again.' })
      }
    },
  })

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <h2 className="text-sm font-medium">Backup settings</h2>
        {config?.configured ? <Badge variant="secondary">Passphrase set</Badge> : <Badge variant="destructive">Not set up</Badge>}
      </div>
      <form
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault()
          form.handleSubmit()
        }}
      >
        <form.AppField name="backupDir">
          {(f) => <f.input label="Backup folder" placeholder="Leave blank for the default. Better: a folder on another drive" />}
        </form.AppField>
        <div className="grid grid-cols-2 gap-3">
          <form.AppField name="intervalHours">{(f) => <f.input label="Back up every (hours)" inputMode="numeric" />}</form.AppField>
          <form.AppField name="retention">{(f) => <f.input label="Keep this many" inputMode="numeric" />}</form.AppField>
        </div>
        <form.AppField name="passphrase">
          {(f) => (
            <f.input
              type="password"
              label={config?.configured ? 'New recovery passphrase (optional)' : 'Recovery passphrase'}
              placeholder="At least 10 characters"
            />
          )}
        </form.AppField>
        <p className="text-xs text-muted-foreground">
          Write the passphrase down and keep it somewhere safe that is not this computer. Without it a backup cannot be restored, and nobody can
          recover it for you. Changing it only affects backups made afterwards.
        </p>
        <form.AppForm>
          <form.submit label="Save backup settings" />
        </form.AppForm>
      </form>
    </section>
  )
}

function ActionDialog({ action, onClose }: { action: Action | null; onClose: () => void }) {
  const [passphrase, setPassphrase] = useState('')
  const [result, setResult] = useState<string | null>(null)
  const [staged, setStaged] = useState(false)
  const verify = useVerifyBackup()
  const restore = useRestoreBackup()

  const close = () => {
    setPassphrase('')
    setResult(null)
    setStaged(false)
    onClose()
  }

  const isRestore = action?.kind === 'restore'
  const busy = verify.isPending || restore.isPending

  return (
    <Dialog open={action !== null} onOpenChange={(open) => !open && close()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isRestore ? 'Restore this backup?' : 'Verify this backup'}</DialogTitle>
          <DialogDescription>
            {isRestore
              ? 'This replaces the facility’s data with the backup’s. Work done since the backup is moved aside, not deleted. The backup is fully checked first, and the swap happens when the application restarts.'
              : 'Opens the backup completely and checks every file against its checksum, without changing anything. A backup you have not verified is a guess.'}
          </DialogDescription>
        </DialogHeader>

        {staged ? (
          <div className="flex flex-col gap-3">
            <p className="text-sm">{result}</p>
            <Button onClick={() => restartApp()}>Restart now to finish</Button>
          </div>
        ) : (
          <form
            className="flex flex-col gap-3"
            onSubmit={async (event) => {
              event.preventDefault()
              if (!action) return
              try {
                if (isRestore) {
                  const summary = await restore.mutateAsync({ path: action.backup.path, passphrase })
                  setResult(`Backup from ${format(summary.createdAt, 'PPp')} is checked and ready. Restart the application to finish.`)
                  setStaged(true)
                } else {
                  const summary = await verify.mutateAsync({ path: action.backup.path, passphrase })
                  setResult(`Verified: ${summary.files} files, ${summary.auditEntries} audit entries, made ${format(summary.createdAt, 'PPp')}.`)
                }
              } catch (error) {
                setResult(null)
                t.error('That backup did not check out', { description: error instanceof ApiError ? error.message : 'Please try again.' })
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
            {result && <p className="text-xs text-emerald-700 dark:text-emerald-400">{result}</p>}
            <Button type="submit" disabled={passphrase.length === 0 || busy}>
              {busy ? 'Checking…' : isRestore ? 'Check and restore' : 'Verify'}
            </Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
