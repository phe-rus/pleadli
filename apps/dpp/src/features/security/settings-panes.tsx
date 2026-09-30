import { SettingsCard } from '@/components/settings-card'
import { Tag } from '@/components/status-tag'
import { RowList, Row } from '@/components/operational-row'
import { ApiError } from '@/lib/api'
import { Button } from '@pleadli/ui/button'
import { Input } from '@pleadli/ui/input'
import { t } from '@pleadli/ui/goey-toaster'
import { useQueryClient } from '@tanstack/react-query'
import { isTauri } from '@tauri-apps/api/core'
import { formatDate } from '@/lib/dates'
import { useState, type FormEvent } from 'react'
import { createBackup, restartApp, stageRestore, verifyAudit } from './data'
import { useAudit, useSecurityStatus } from './queries'
import { auditActionLabel, type Staged } from './schema'
import * as m from '@/paraglide/messages'

const say = (error: unknown) => (error instanceof ApiError ? error.message : typeof error === 'string' ? error : m["common.try_again"]())

export function DataProtection() {
  const { data: status } = useSecurityStatus()
  const keystore = status?.protection === 'keystore'
  return (
    <SettingsCard
      title={m["security.protection.title"]()}
      badge={<Tag tone={keystore ? 'done' : 'open'}>{keystore ? m["security.protection.keystore"]() : m["security.protection.key_file"]()}</Tag>}
      description={m["security.protection.description"]()}
      hint={
        keystore
          ? m["security.protection.keystore_hint"]()
          : m["security.protection.key_file_hint"]()
      }
    >
      <RowList>
        <Row aligned title={m["security.protection.database"]()} summary={m["security.protection.database_summary"]()} trailing={<Tag tone="done">{m["security.protection.encrypted"]()}</Tag>} />
        <Row aligned title={m["nav.item.documents"]()} summary={m["security.protection.documents_summary"]()} trailing={<Tag tone="done">{m["security.protection.sealed"]()}</Tag>} />
      </RowList>
    </SettingsCard>
  )
}

export function AuditCard() {
  const { data: entries } = useAudit(15)
  const [verdict, setVerdict] = useState<string | null>(null)
  return (
    <SettingsCard
      title={m["security.audit.title"]()}
      description={m["security.audit.description"]()}
      hint={verdict ?? undefined}
      action={
        <Button
          size="sm"
          variant="outline"
          onClick={() =>
            void verifyAudit().then(
              (v) => setVerdict(v.intact ? m["security.audit.intact"]({ entries: v.entries }) : m["security.audit.broken"]({ entry: String(v.brokenAt) })),
              (e) => t.error(m["security.audit.verify_failed"](), { description: say(e) }),
            )
          }
        >
          {m["security.audit.verify"]()}
        </Button>
      }
    >
      {!entries || entries.length === 0 ? (
        <p>{m["overview.activity_empty"]()}</p>
      ) : (
        <RowList>
          {entries.map((e) => (
            <Row key={e.seq} aligned title={auditActionLabel(e.action)} summary={`${formatDate(e.at, 'datetime')}${e.actor ? `, ${e.actor}` : ''}${e.detail ? `. ${e.detail}` : ''}`} />
          ))}
        </RowList>
      )}
    </SettingsCard>
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
    if (passphrase !== confirm) return t.error(m["security.passphrase_mismatch"]())
    setBusy(true)
    try {
      if (await createBackup(passphrase)) {
        t.success(m["security.backup.saved"]())
        setPassphrase('')
        setConfirm('')
        await queryClient.invalidateQueries({ queryKey: ['security'] })
      }
    } catch (e) {
      t.error(m["security.backup.failed"](), { description: say(e) })
    } finally {
      setBusy(false)
    }
  }

  return (
    <SettingsCard
      title={m["security.backup.title"]()}
      badge={<Tag tone={status?.lastBackupAt ? 'done' : 'open'}>{status?.lastBackupAt ? m["security.backup.last"]({ date: formatDate(status.lastBackupAt) }) : m["security.backup.never"]()}</Tag>}
      description={m["security.backup.description"]()}
      hint={m["security.backup.hint"]()}
      onSubmit={make}
      action={
        <Button type="submit" size="sm" disabled={busy || passphrase.length < 10}>
          {m["security.backup.title"]()}
        </Button>
      }
    >
      <Input type="password" aria-label={m["security.backup.passphrase"]()} placeholder={m["security.backup.passphrase_placeholder"]()} value={passphrase} onChange={(e) => setPassphrase(e.target.value)} autoComplete="new-password" />
      <Input type="password" aria-label={m["security.backup.confirm"]()} placeholder={m["security.confirm_placeholder"]()} value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" />
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
      t.error(m["security.restore.open_failed"](), { description: say(e) })
    } finally {
      setBusy(false)
    }
  }

  return (
    <SettingsCard
      title={m["security.restore.title"]()}
      badge={ready ? <Tag tone="open">{m["security.restore.ready"]()}</Tag> : undefined}
      description={m["security.restore.description"]()}
      hint={ready ? `${staged ? `${m["security.restore.staged"]({ date: formatDate(staged.createdAt, 'datetime'), documents: staged.documents })} ` : ''}${isTauri() ? '' : m["security.restore.restart_to_finish"]()}` : undefined}
      onSubmit={ready ? undefined : stage}
      action={
        ready ? (
          isTauri() ? (
            <Button type="button" size="sm" onClick={() => void restartApp()}>
              {m["security.restore.restart"]()}
            </Button>
          ) : null
        ) : (
          <Button type="submit" size="sm" disabled={busy || passphrase.length === 0 || (!isTauri() && !file)}>
            {isTauri() ? m["security.restore.choose"]() : m["security.restore.open"]()}
          </Button>
        )
      }
    >
      {!ready && (
        <>
          {!isTauri() && <input type="file" accept=".dppbk" aria-label={m["security.restore.file"]()} onChange={(e) => setFile(e.target.files?.[0])} />}
          <Input type="password" aria-label={m["security.backup.passphrase"]()} placeholder={m["security.backup.passphrase"]()} value={passphrase} onChange={(e) => setPassphrase(e.target.value)} />
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
