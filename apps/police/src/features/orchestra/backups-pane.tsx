import * as m from '@/paraglide/messages'
import { SettingsCard, SettingsRow } from '@/components/settings-card'
import { Tag } from '@/components/status-tag'
import { useMe } from '@/features/session'
import { format, formatDistanceToNowStrict } from '@/lib/date'
import { Button } from '@pleadli/ui/button'
import { t } from '@pleadli/ui/goey-toaster'
import { Input } from '@pleadli/ui/input'
import { isTauri } from '@tauri-apps/api/core'
import { useState } from 'react'
import { orchestraErrorCode, type OrchestraStatus, type StagedRestore } from './data'
import { useBackUpNow, useCancelRestore, useCheckStorage, useOrchestra, useStageRestore } from './queries'
import { errorText, kindText, sizeText } from './words'

/** Record backups: the whole record, locked with the institution's recovery
 * key on this computer, sent once a day to the storage the institution chose
 * on pleadli.com/orchestra. Pleadli never holds a copy. */
export function BackupsPane() {
  const { data: status } = useOrchestra()
  const { data: me } = useMe()
  if (!status) return null

  if (me?.role !== 'admin') {
    return (
      <SettingsCard description={m["orchestra.backups.admin_only"]()}>
        <SettingsRow label={m["orchestra.backups.last"]()}>
          <span className="text-muted-foreground">{status.backup.lastOkAt ? formatDistanceToNowStrict(Math.min(status.backup.lastOkAt, Date.now()), { addSuffix: true }) : m["orchestra.backups.never"]()}</span>
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
        <SettingsCard title={m["orchestra.backups.needs_licence_title"]()} description={m["orchestra.backups.needs_licence"]()} />
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
      title={m["orchestra.backups.title"]()}
      description={m["orchestra.backups.about"]()}
      hint={!status.backup.keyFingerprint ? m["orchestra.error.no_recovery_phrase"]() : approved.length === 0 ? m["orchestra.backups.none_approved"]() : m["orchestra.backups.daily"]()}
      action={
        <Button
          size="sm"
          disabled={!ready || running}
          onClick={async () => {
            try {
              const runs = await backUp.mutateAsync()
              const ok = runs.filter((r) => r.ok).length
              if (ok === runs.length) t.success(m["orchestra.backups.done"]())
              else t.error(m["orchestra.backups.partly"]({ ok: String(ok), total: String(runs.length) }))
            } catch (e) {
              t.error(errorText(orchestraErrorCode(e)))
            }
          }}
        >
          {running ? m["orchestra.backups.running"]() : m["orchestra.backups.now"]()}
        </Button>
      }
    >
      <SettingsRow label={m["orchestra.backups.last"]()} hint={status.backup.lastOkAt ? format(status.backup.lastOkAt, 'PP p') : undefined}>
        <span className="text-muted-foreground">{status.backup.lastOkAt ? formatDistanceToNowStrict(Math.min(status.backup.lastOkAt, Date.now()), { addSuffix: true }) : m["orchestra.backups.never"]()}</span>
      </SettingsRow>
      <SettingsRow label={m["orchestra.backups.key"]()} hint={m["orchestra.backups.key_hint"]()}>
        <span className="font-mono text-muted-foreground">{status.backup.keyFingerprint ?? '·'}</span>
      </SettingsRow>
    </SettingsCard>
  )
}

function StorageCard({ status }: { status: OrchestraStatus }) {
  const check = useCheckStorage()
  const [checking, setChecking] = useState<string | null>(null)

  return (
    <SettingsCard title={m["orchestra.storage.title"]()} description={m["orchestra.storage.about"]()} hint={status.backup.storage.length === 0 ? m["orchestra.error.no_storage"]() : undefined}>
      {status.backup.storage.map((s) => (
        <SettingsRow
          key={s.id}
          label={
            <span className="flex flex-wrap items-center gap-2">
              {s.label}
              <Tag tone={s.approved ? 'done' : 'waiting'}>{s.approved ? m["orchestra.storage.approved"]() : m["orchestra.storage.waiting"]()}</Tag>
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
                t.success(m["orchestra.storage.works"]({ label: s.label }))
              } catch (e) {
                t.error(errorText(orchestraErrorCode(e)))
              } finally {
                setChecking(null)
              }
            }}
          >
            {checking === s.id ? m["orchestra.storage.testing"]() : m["orchestra.storage.test"]()}
          </Button>
        </SettingsRow>
      ))}
    </SettingsCard>
  )
}

function HistoryCard({ status }: { status: OrchestraStatus }) {
  return (
    <SettingsCard title={m["orchestra.history.title"]()}>
      {status.backup.history.map((run) => (
        <SettingsRow key={run.id} label={format(run.at, 'PP p')} hint={run.ok ? `${run.storageLabel ?? ''} · ${sizeText(run.sizeBytes)}` : (run.message ?? undefined)}>
          <Tag tone={run.ok ? 'done' : 'urgent'}>{run.ok ? m["orchestra.history.ok"]() : m["orchestra.history.failed"]()}</Tag>
        </SettingsRow>
      ))}
    </SettingsCard>
  )
}

async function relaunch() {
  if (!isTauri()) {
    t.success(m["orchestra.restore.restart_browser"]())
    return
  }
  const { relaunch } = await import('@tauri-apps/plugin-process')
  await relaunch()
}

function PendingRestore() {
  const cancel = useCancelRestore()
  return (
    <SettingsCard
      title={m["orchestra.restore.pending_title"]()}
      badge={<Tag tone="open">{m["orchestra.restore.pending_badge"]()}</Tag>}
      description={m["orchestra.restore.pending"]()}
      action={
        <div className="flex justify-end gap-2">
          <Button size="sm" variant="outline" disabled={cancel.isPending} onClick={() => void cancel.mutateAsync()}>
            {m["orchestra.restore.cancel"]()}
          </Button>
          <Button size="sm" onClick={() => void relaunch()}>
            {m["orchestra.restore.restart"]()}
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
    const picked = await open({ multiple: false, directory: false, filters: [{ name: m["orchestra.restore.file_type"](), extensions: ['pleadli-backup'] }] })
    if (typeof picked === 'string') setPath(picked)
  }

  if (staged) {
    return (
      <SettingsCard
        title={m["orchestra.restore.ready_title"]()}
        description={m["orchestra.restore.ready"]({ date: format(staged.createdAt, 'PP p'), documents: String(staged.documents) })}
        hint={staged.missing > 0 ? m["orchestra.restore.missing"]({ count: String(staged.missing) }) : m["orchestra.restore.kept_aside"]()}
        action={
          <Button size="sm" onClick={() => void relaunch()}>
            {m["orchestra.restore.restart"]()}
          </Button>
        }
      />
    )
  }

  return (
    <SettingsCard
      title={m["orchestra.restore.title"]()}
      description={m["orchestra.restore.about"]()}
      hint={error ?? m["orchestra.restore.kept_aside"]()}
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
          {stage.isPending ? m["orchestra.restore.checking"]() : m["orchestra.restore.restore"]()}
        </Button>
      }
    >
      <SettingsRow label={m["orchestra.restore.file"]()}>
        {(id) =>
          isTauri() ? (
            <div className="flex w-full min-w-0 items-center justify-end gap-2">
              {path && <span className="min-w-0 truncate text-muted-foreground">{path.split(/[\\/]/).pop()}</span>}
              <Button id={id} size="sm" variant="outline" type="button" onClick={() => void choose()}>
                {path ? m["orchestra.restore.change"]() : m["orchestra.restore.choose"]()}
              </Button>
            </div>
          ) : (
            <Input id={id} value={path} onChange={(e) => setPath(e.target.value)} placeholder="/path/to/backup.pleadli-backup" spellCheck={false} />
          )
        }
      </SettingsRow>
      <SettingsRow label={m["orchestra.restore.phrase"]()} hint={m["orchestra.restore.phrase_hint"]()}>
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
