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
import { m } from '@/paraglide/messages'

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
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-3">
          <div className="flex flex-col gap-0.5">
            <h3>{m.node_backups()}</h3>
            <p>
              {!config.configured
                ? m.node_no_backups_are_being_made_set()
                : config.lastBackupAt
                  ? m.node_last_backup_every_hours_keeping({ lastBackupAt: format(config.lastBackupAt, 'PPp'), backupIntervalHours: config.backupIntervalHours, backupRetention: config.backupRetention })
                  : m.node_backs_up_every_hours_keeping_none({ backupIntervalHours: config.backupIntervalHours, backupRetention: config.backupRetention })}
            </p>
          </div>
          <Button
            size="sm"
            disabled={!config.configured || runBackup.isPending}
            onClick={() =>
              runBackup.mutate(undefined, {
                onSuccess: (info) => t.success(m.node_backup_written(), { description: `${info.fileName} (${formatBytes(info.sizeBytes)})` }),
                onError: (error) => t.error(m.node_backup_failed(), { description: error instanceof ApiError ? error.message : m.node_please_try_again() }),
              })
            }
          >
            {runBackup.isPending ? m.node_backing_up() : m.node_back_up_now()}
          </Button>
        </div>

        {config.lastBackupStatus === 'error' && (
          <p className="rounded-md border border-destructive/40 bg-destructive/5 p-2 text-destructive">
            {config.lastBackupError ? m.node_last_backup_failed_with({ error: config.lastBackupError }) : m.node_last_backup_failed()}
          </p>
        )}
        <p>
          {m.node_folder()} <code>{config.effectiveDir}</code>
          {config.backupDir == null && m.node_default_folder_note()}
        </p>

        {backups.length === 0 ? (
          <p>{m.node_no_backups_in_that_folder_yet()}</p>
        ) : (
          <div className="flex flex-col divide-y divide-border/60 rounded-lg border border-border">
            {backups.map((backup) => (
              <div key={backup.path} className="flex items-center justify-between gap-3 px-3 py-2">
                <div className="flex min-w-0 flex-col">
                  <h4 className="truncate">{format(backup.createdAt, 'PPp')}</h4>
                  <p className="truncate">
                    {backup.fileName} · {formatBytes(backup.sizeBytes)}
                  </p>
                </div>
                <div className="flex shrink-0 gap-1.5">
                  <Button size="xs" variant="secondary" onClick={() => setAction({ kind: 'verify', backup })}>
                    {m.node_verify()}
                  </Button>
                  <Button size="xs" variant="secondary" onClick={() => setAction({ kind: 'restore', backup })}>
                    {m.node_restore()}
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
        t.success(m.node_backup_settings_saved())
      } catch (error) {
        t.error(m.node_could_not_save(), { description: error instanceof ApiError ? error.message : m.node_check_the_values_and_try_again() })
      }
    },
  })

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <h3>{m.node_backup_settings()}</h3>
        {config?.configured ? <Badge variant="secondary">{m.node_passphrase_set()}</Badge> : <Badge variant="destructive">{m.node_not_set_up()}</Badge>}
      </div>
      <form
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault()
          form.handleSubmit()
        }}
      >
        <form.AppField name="backupDir">
          {(f) => <f.input label={m.node_backup_folder()} placeholder={m.node_leave_blank_for_the_default_better()} />}
        </form.AppField>
        <div className="grid grid-cols-2 gap-3">
          <form.AppField name="intervalHours">{(f) => <f.input label={m.node_back_up_every_hours()} inputMode="numeric" />}</form.AppField>
          <form.AppField name="retention">{(f) => <f.input label={m.node_keep_this_many()} inputMode="numeric" />}</form.AppField>
        </div>
        <form.AppField name="passphrase">
          {(f) => (
            <f.input
              type="password"
              label={config?.configured ? m.node_new_recovery_passphrase_optional() : m.node_recovery_passphrase()}
              placeholder={m.node_at_least_10_characters()}
            />
          )}
        </form.AppField>
        <p>
          {m.node_write_the_passphrase_down_and_keep()}
        </p>
        <form.AppForm>
          <form.submit label={m.node_save_backup_settings()} />
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
          <DialogTitle>{isRestore ? m.node_restore_this_backup() : m.node_verify_this_backup()}</DialogTitle>
          <DialogDescription>
            {isRestore
              ? m.node_this_replaces_the_facility_s_data()
              : m.node_opens_the_backup_completely_and_checks()}
          </DialogDescription>
        </DialogHeader>

        {staged ? (
          <div className="flex flex-col gap-3">
            <p>{result}</p>
            <Button onClick={() => restartApp()}>{m.node_restart_now_to_finish()}</Button>
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
                  setResult(m.node_backup_from_is_checked_and_ready({ createdAt: format(summary.createdAt, 'PPp') }))
                  setStaged(true)
                } else {
                  const summary = await verify.mutateAsync({ path: action.backup.path, passphrase })
                  setResult(m.node_verified_files_audit_entries_made({ files: summary.files, auditEntries: summary.auditEntries, createdAt: format(summary.createdAt, 'PPp') }))
                }
              } catch (error) {
                setResult(null)
                t.error(m.node_that_backup_did_not_check_out(), { description: error instanceof ApiError ? error.message : m.node_please_try_again() })
              }
            }}
          >
            <label className="flex flex-col gap-1.5">
              <strong>{m.node_recovery_passphrase()}</strong>
              <input
                type="password"
                autoFocus
                value={passphrase}
                onChange={(event) => setPassphrase(event.target.value)}
                className="h-9 w-full rounded-md border border-border bg-background px-2.5 outline-none focus:border-primary"
              />
            </label>
            {result && <p className="text-emerald-700 dark:text-emerald-400">{result}</p>}
            <Button type="submit" disabled={passphrase.length === 0 || busy}>
              {busy ? m.node_checking() : isRestore ? m.node_check_and_restore() : m.node_verify()}
            </Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
