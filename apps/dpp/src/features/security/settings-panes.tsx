import { SettingsCard } from '@/components/settings-card'
import { Tag } from '@/components/status-tag'
import { RowList, Row } from '@/components/operational-row'
import { ApiError } from '@/lib/api'
import { Button } from '@pleadli/ui/button'
import { Input } from '@pleadli/ui/input'
import { t } from '@pleadli/ui/goey-toaster'
import { useQueryClient } from '@tanstack/react-query'
import { isTauri } from '@tauri-apps/api/core'
import { format } from 'date-fns/format'
import { useState, type FormEvent } from 'react'
import { createBackup, lockNow, removePassphrase, restartApp, setIdleMinutes, setPassphrase, stageRestore, verifyAudit } from './data'
import { useAudit, useSecurityStatus } from './queries'
import { auditActionLabel, idleChoices, type Staged } from './schema'

const say = (error: unknown) => (error instanceof ApiError ? error.message : typeof error === 'string' ? error : 'Please try again.')

function DataProtection() {
  const { data: status } = useSecurityStatus()
  const keystore = status?.protection === 'keystore'
  return (
    <SettingsCard
      title="Protection of the records"
      badge={<Tag tone={keystore ? 'done' : 'open'}>{keystore ? 'Key in the system keystore' : 'Key in a file'}</Tag>}
      description="The database and every document are encrypted on this computer, whether or not a lock is set."
      hint={
        keystore
          ? 'Copying the data folder to another computer copies nothing that opens it.'
          : 'This computer has no system keystore, so the key sits in a file beside the data. That protects a copy of the database or the vault on its own, but not a copy of the whole data folder.'
      }
    >
      <RowList>
        <Row aligned title="Database" summary="Encrypted with SQLCipher." trailing={<Tag tone="done">Encrypted</Tag>} />
        <Row aligned title="Documents" summary="Each one sealed in the vault under a name that is only its id." trailing={<Tag tone="done">Sealed</Tag>} />
      </RowList>
    </SettingsCard>
  )
}

function LockCard() {
  const queryClient = useQueryClient()
  const { data: status } = useSecurityStatus()
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  if (!status) return null
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['security'] })

  const save = async (event: FormEvent) => {
    event.preventDefault()
    if (next !== confirm) return t.error('The two passphrases are not the same')
    setBusy(true)
    try {
      await setPassphrase(status.configured ? current : null, next)
      t.success(status.configured ? 'Passphrase changed' : 'Application lock turned on')
      setCurrent('')
      setNext('')
      setConfirm('')
      await refresh()
    } catch (e) {
      t.error('Could not save', { description: say(e) })
    } finally {
      setBusy(false)
    }
  }

  return (
    <SettingsCard
      title="Application lock"
      badge={<Tag tone={status.configured ? 'done' : 'neutral'}>{status.configured ? 'On' : 'Off'}</Tag>}
      description="A passphrase in front of the application. When it is on, files, decisions and documents cannot be read until it is entered, and the app locks itself when left idle."
      hint="It protects the screen from someone at an unattended computer. It is not what encrypts the data."
      onSubmit={save}
      action={
        <Button type="submit" size="sm" disabled={busy || next.length === 0}>
          {status.configured ? 'Change passphrase' : 'Turn on the lock'}
        </Button>
      }
    >
      {status.configured && <Input type="password" aria-label="Current passphrase" placeholder="Current passphrase" value={current} onChange={(e) => setCurrent(e.target.value)} />}
      <Input type="password" aria-label="New passphrase" placeholder="New passphrase (at least 8 characters)" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" />
      <Input type="password" aria-label="Confirm passphrase" placeholder="Confirm the passphrase" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" />
      {status.configured && (
        <div className="flex flex-col gap-3 border-t pt-4">
          <label className="flex items-center justify-between gap-3">
            <strong>Lock when idle for</strong>
            <select
              className="h-8 rounded-md border border-input bg-input/20 px-2"
              value={status.idleMinutes}
              onChange={(e) => void setIdleMinutes(Number(e.target.value)).then(refresh, (err) => t.error('Could not save', { description: say(err) }))}
            >
              {idleChoices.map((c) => (
                <option key={c.minutes} value={c.minutes}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" variant="outline" onClick={() => void lockNow().then(refresh)}>
              Lock now
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => {
                const passphrase = window.prompt('Enter the current passphrase to turn the lock off')
                if (passphrase) void removePassphrase(passphrase).then(() => (t.success('Application lock turned off'), refresh()), (err) => t.error('Could not turn it off', { description: say(err) }))
              }}
            >
              Turn the lock off
            </Button>
          </div>
        </div>
      )}
    </SettingsCard>
  )
}

function AuditCard() {
  const { data: entries } = useAudit(15)
  const [verdict, setVerdict] = useState<string | null>(null)
  return (
    <SettingsCard
      title="Audit trail"
      description="An append-only record of decisions, reviews, documents issued, attachments, the lock and backups. Each entry is chained to the one before, so an entry that is changed or removed shows up."
      hint={verdict ?? undefined}
      action={
        <Button
          size="sm"
          variant="outline"
          onClick={() =>
            void verifyAudit().then(
              (v) => setVerdict(v.intact ? `Verified: ${v.entries} entries, chain intact.` : `The chain is broken at entry ${v.brokenAt}.`),
              (e) => t.error('Could not verify', { description: say(e) }),
            )
          }
        >
          Verify the chain
        </Button>
      }
    >
      {!entries || entries.length === 0 ? (
        <p>Nothing has been recorded yet.</p>
      ) : (
        <RowList>
          {entries.map((e) => (
            <Row key={e.seq} aligned title={auditActionLabel(e.action)} summary={`${format(e.at, 'PPp')}${e.actor ? `, ${e.actor}` : ''}${e.detail ? `. ${e.detail}` : ''}`} />
          ))}
        </RowList>
      )}
    </SettingsCard>
  )
}

export function SecurityPane() {
  return (
    <>
      <DataProtection />
      <LockCard />
      <AuditCard />
    </>
  )
}

function BackupCard() {
  const queryClient = useQueryClient()
  const { data: status } = useSecurityStatus()
  const [passphrase, setPassphrase] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)

  const make = async (event: FormEvent) => {
    event.preventDefault()
    if (passphrase !== confirm) return t.error('The two passphrases are not the same')
    setBusy(true)
    try {
      if (await createBackup(passphrase)) {
        t.success('Backup saved')
        setPassphrase('')
        setConfirm('')
        await queryClient.invalidateQueries({ queryKey: ['security'] })
      }
    } catch (e) {
      t.error('Could not make the backup', { description: say(e) })
    } finally {
      setBusy(false)
    }
  }

  return (
    <SettingsCard
      title="Make a backup"
      badge={<Tag tone={status?.lastBackupAt ? 'done' : 'open'}>{status?.lastBackupAt ? `Last ${format(status.lastBackupAt, 'PP')}` : 'Never backed up'}</Tag>}
      description="One encrypted file holding every record and document. Only the passphrase below opens it, and it is not stored anywhere: if it is lost, the backup cannot be opened."
      hint="Keep the file somewhere other than this computer, and the passphrase somewhere other than the file."
      onSubmit={make}
      action={
        <Button type="submit" size="sm" disabled={busy || passphrase.length < 10}>
          Make a backup
        </Button>
      }
    >
      <Input type="password" aria-label="Backup passphrase" placeholder="Backup passphrase (at least 10 characters)" value={passphrase} onChange={(e) => setPassphrase(e.target.value)} autoComplete="new-password" />
      <Input type="password" aria-label="Confirm backup passphrase" placeholder="Confirm the passphrase" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" />
    </SettingsCard>
  )
}

function RestoreCard() {
  const { data: status } = useSecurityStatus()
  const [passphrase, setPassphrase] = useState('')
  const [file, setFile] = useState<File | undefined>()
  const [staged, setStaged] = useState<Staged | null>(null)
  const [busy, setBusy] = useState(false)
  const ready = staged !== null || status?.restorePending

  const stage = async (event: FormEvent) => {
    event.preventDefault()
    setBusy(true)
    try {
      const result = await stageRestore(passphrase, file)
      if (result) setStaged(result)
    } catch (e) {
      t.error('That backup could not be opened', { description: say(e) })
    } finally {
      setBusy(false)
    }
  }

  return (
    <SettingsCard
      title="Restore from a backup"
      badge={ready ? <Tag tone="open">Ready to restore</Tag> : undefined}
      description="Replaces the records and documents with those in a backup. The current ones are kept aside, not deleted. Nothing changes until the application restarts."
      hint={ready ? `${staged ? `A backup made ${format(staged.createdAt, 'PPp')} with ${staged.documents} documents is ready. ` : ''}${isTauri() ? '' : 'Restart the application to finish.'}` : undefined}
      onSubmit={ready ? undefined : stage}
      action={
        ready ? (
          isTauri() ? (
            <Button type="button" size="sm" onClick={() => void restartApp()}>
              Restart and restore
            </Button>
          ) : null
        ) : (
          <Button type="submit" size="sm" disabled={busy || passphrase.length === 0 || (!isTauri() && !file)}>
            {isTauri() ? 'Choose a backup' : 'Open the backup'}
          </Button>
        )
      }
    >
      {!ready && (
        <>
          {!isTauri() && <input type="file" accept=".dppbk" aria-label="Backup file" onChange={(e) => setFile(e.target.files?.[0])} />}
          <Input type="password" aria-label="Passphrase of the backup" placeholder="Passphrase of the backup" value={passphrase} onChange={(e) => setPassphrase(e.target.value)} />
        </>
      )}
    </SettingsCard>
  )
}

export function BackupPane() {
  return (
    <>
      <BackupCard />
      <RestoreCard />
    </>
  )
}
