import { m } from '@/paraglide/messages'
import { SettingsCard } from '@/components/settings-card'
import { SettingsRow, Tag } from './parts'
import { ago, when } from './words'
import { Button } from '@pleadli/ui/button'
import { t } from '@pleadli/ui/goey-toaster'
import { Input } from '@pleadli/ui/input'
import { isTauri } from '@tauri-apps/api/core'
import { useState } from 'react'
import { orchestraErrorCode, type OrchestraStatus, type StagedRestore } from './data'
import { useBackUpNow, useCancelRestore, useCheckStorage, useIsAdmin, useOrchestra, useStageRestore } from './queries'
import { errorText, kindText, sizeText } from './words'

/** Record backups: the whole record, locked with the institution's recovery
 * key on this computer, sent once a day to the storage the institution chose
 * on pleadli.com/orchestra. Pleadli never holds a copy. */
export function BackupsPane() {
  const { data: status } = useOrchestra()
  const admin = useIsAdmin()
  if (!status) return null

  if (!admin) {
    return (
      <SettingsCard description={m.orchestra_backups_admin_only()}>
        <SettingsRow label={m.orchestra_backups_last()}>
          <span className="text-muted-foreground">{status.backup.lastOkAt ? ago(Math.min(status.backup.lastOkAt, Date.now())) : m.orchestra_backups_never()}</span>
        </SettingsRow>
      </SettingsCard>
    )
  }

  return (
    <>
      {status.restorePending && <PendingRestore />}
      {status.state === 'licensed' ? (
        <>
          <NowCard status={status} />
          <StorageCard status={status} />
          {status.backup.history.length > 0 && <HistoryCard status={status} />}
        </>
      ) : (
        <SettingsCard title={m.orchestra_backups_needs_licence_title()} description={m.orchestra_backups_needs_licence()} />
      )}
      <RestoreCard />
    </>
  )
}

function NowCard({ status }: { status: OrchestraStatus }) {
  const backUp = useBackUpNow()
  const running = status.backup.running || backUp.isPending
  const approved = status.backup.storage.filter((s) => s.approved)
  // Storage approved a minute ago is not in the kept list yet; backing up
  // fetches fresh settings first, so the key alone is enough to try.
  const ready = !!status.backup.keyFingerprint

  return (
    <SettingsCard
      title={m.orchestra_backups_title()}
      description={m.orchestra_backups_about()}
      hint={!status.backup.keyFingerprint ? m.orchestra_error_no_recovery_phrase() : approved.length === 0 ? m.orchestra_backups_none_approved() : m.orchestra_backups_daily()}
      action={
        <Button
          size="sm"
          disabled={!ready || running}
          onClick={async () => {
            try {
              const runs = await backUp.mutateAsync()
              const ok = runs.filter((r) => r.ok).length
              if (ok === runs.length) t.success(m.orchestra_backups_done())
              else t.error(m.orchestra_backups_partly({ ok: String(ok), total: String(runs.length) }))
            } catch (e) {
              t.error(errorText(orchestraErrorCode(e)))
            }
          }}
        >
          {running ? m.orchestra_backups_running() : m.orchestra_backups_now()}
        </Button>
      }
    >
      <SettingsRow label={m.orchestra_backups_last()} hint={status.backup.lastOkAt ? when(status.backup.lastOkAt) : undefined}>
        <span className="text-muted-foreground">{status.backup.lastOkAt ? ago(Math.min(status.backup.lastOkAt, Date.now())) : m.orchestra_backups_never()}</span>
      </SettingsRow>
      <SettingsRow label={m.orchestra_backups_key()} hint={m.orchestra_backups_key_hint()}>
        <span className="font-mono text-muted-foreground">{status.backup.keyFingerprint ?? '·'}</span>
      </SettingsRow>
    </SettingsCard>
  )
}

function StorageCard({ status }: { status: OrchestraStatus }) {
  const check = useCheckStorage()
  const [checking, setChecking] = useState<string | null>(null)

  return (
    <SettingsCard title={m.orchestra_storage_title()} description={m.orchestra_storage_about()} hint={status.backup.storage.length === 0 ? m.orchestra_error_no_storage() : undefined}>
      {status.backup.storage.map((s) => (
        <SettingsRow
          key={s.id}
          label={
            <span className="flex flex-wrap items-center gap-2">
              {s.label}
              <Tag tone={s.approved ? 'done' : 'waiting'}>{s.approved ? m.orchestra_storage_approved() : m.orchestra_storage_waiting()}</Tag>
            </span>
          }
          hint={`${kindText(s.kind)} · ${s.place}`}
        >
          <Button
            size="sm"
            variant="outline"
            disabled={!s.approved || checking !== null}
            onClick={async () => {
              setChecking(s.id)
              try {
                await check.mutateAsync(s.id)
                t.success(m.orchestra_storage_works({ label: s.label }))
              } catch (e) {
                t.error(errorText(orchestraErrorCode(e)))
              } finally {
                setChecking(null)
              }
            }}
          >
            {checking === s.id ? m.orchestra_storage_testing() : m.orchestra_storage_test()}
          </Button>
        </SettingsRow>
      ))}
    </SettingsCard>
  )
}

function HistoryCard({ status }: { status: OrchestraStatus }) {
  return (
    <SettingsCard title={m.orchestra_history_title()}>
      {status.backup.history.map((run) => (
        <SettingsRow key={run.id} label={when(run.at)} hint={run.ok ? `${run.storageLabel ?? ''} · ${sizeText(run.sizeBytes)}` : (run.message ?? undefined)}>
          <Tag tone={run.ok ? 'done' : 'urgent'}>{run.ok ? m.orchestra_history_ok() : m.orchestra_history_failed()}</Tag>
        </SettingsRow>
      ))}
    </SettingsCard>
  )
}

async function relaunch() {
  if (!isTauri()) {
    t.success(m.orchestra_restore_restart_browser())
    return
  }
  const { relaunch } = await import('@tauri-apps/plugin-process')
  await relaunch()
}

function PendingRestore() {
  const cancel = useCancelRestore()
  return (
    <SettingsCard
      title={m.orchestra_restore_pending_title()}
      badge={<Tag tone="open">{m.orchestra_restore_pending_badge()}</Tag>}
      description={m.orchestra_restore_pending()}
      action={
        <div className="flex justify-end gap-2">
          <Button size="sm" variant="outline" disabled={cancel.isPending} onClick={() => void cancel.mutateAsync()}>
            {m.orchestra_restore_cancel()}
          </Button>
          <Button size="sm" onClick={() => void relaunch()}>
            {m.orchestra_restore_restart()}
          </Button>
        </div>
      }
    />
  )
}

/** Restoring asks for the backup file and the recovery phrase, checks the
 * backup completely, and puts it in place at the next start. The data on this
 * computer now is kept aside, not deleted. */
function RestoreCard() {
  const stage = useStageRestore()
  const [path, setPath] = useState('')
  const [phrase, setPhrase] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [staged, setStaged] = useState<StagedRestore | null>(null)

  async function choose() {
    if (!isTauri()) return
    const { open } = await import('@tauri-apps/plugin-dialog')
    const picked = await open({ multiple: false, directory: false, filters: [{ name: m.orchestra_restore_file_type(), extensions: ['pleadli-backup'] }] })
    if (typeof picked === 'string') setPath(picked)
  }

  if (staged) {
    return (
      <SettingsCard
        title={m.orchestra_restore_ready_title()}
        description={m.orchestra_restore_ready({ date: when(staged.createdAt), documents: String(staged.documents) })}
        hint={staged.missing > 0 ? m.orchestra_restore_missing({ count: String(staged.missing) }) : m.orchestra_restore_kept_aside()}
        action={
          <Button size="sm" onClick={() => void relaunch()}>
            {m.orchestra_restore_restart()}
          </Button>
        }
      />
    )
  }

  return (
    <SettingsCard
      title={m.orchestra_restore_title()}
      description={m.orchestra_restore_about()}
      hint={error ?? m.orchestra_restore_kept_aside()}
      onSubmit={async (event) => {
        event.preventDefault()
        setError(null)
        try {
          setStaged(await stage.mutateAsync({ path, phrase }))
          setPhrase('')
        } catch (e) {
          setError(errorText(orchestraErrorCode(e)))
        }
      }}
      action={
        <Button size="sm" type="submit" variant="outline" disabled={stage.isPending || !path || phrase.replace(/[^0-9a-z]/gi, '').length < 32}>
          {stage.isPending ? m.orchestra_restore_checking() : m.orchestra_restore_restore()}
        </Button>
      }
    >
      <SettingsRow label={m.orchestra_restore_file()}>
        {(id) =>
          isTauri() ? (
            <div className="flex w-full min-w-0 items-center justify-end gap-2">
              {path && <span className="min-w-0 truncate text-muted-foreground">{path.split(/[\\/]/).pop()}</span>}
              <Button id={id} size="sm" variant="outline" type="button" onClick={() => void choose()}>
                {path ? m.orchestra_restore_change() : m.orchestra_restore_choose()}
              </Button>
            </div>
          ) : (
            <Input id={id} value={path} onChange={(e) => setPath(e.target.value)} placeholder="/path/to/backup.pleadli-backup" spellCheck={false} />
          )
        }
      </SettingsRow>
      <SettingsRow label={m.orchestra_restore_phrase()} hint={m.orchestra_restore_phrase_hint()}>
        {(id) => (
          <Input
            id={id}
            value={phrase}
            onChange={(e) => setPhrase(e.target.value.toUpperCase())}
            placeholder="XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX"
            autoComplete="new-password"
            spellCheck={false}
            className="font-mono"
          />
        )}
      </SettingsRow>
    </SettingsCard>
  )
}
