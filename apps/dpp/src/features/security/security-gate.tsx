import { formatDate } from '@/lib/dates'
import { productName } from '@/lib/jurisdiction'
import { Controls } from '@/components/toolbar/controls'
import { onLocked } from '@/lib/api'
import { ApiError } from '@/lib/api'
import { Button } from '@pleadli/ui/button'
import { Input } from '@pleadli/ui/input'
import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useState, type ReactNode } from 'react'
import { restartApp, stageRestore, unlock } from './data'
import { useSecurityStatus } from './queries'
import type { Staged } from './schema'
import { BrandLogo } from '@/features/brand'
import { isTauri } from '@tauri-apps/api/core'
import * as m from '@/paraglide/messages'

function Centered({ children }: { children: ReactNode }) {
  return (
    <main data-tauri-drag-region className="typeset relative flex h-svh items-center justify-center bg-background p-6">
      {/* The window has no title bar of its own, so a locked window keeps its buttons. */}
      <div className="absolute top-3 right-3">
        <Controls />
      </div>
      <div className="flex w-full max-w-sm flex-col gap-5 rounded-lg border bg-card p-6">{children}</div>
    </main>
  )
}

export function LockScreen({ retryAfter, onUnlocked }: { retryAfter: number; onUnlocked?: () => void }) {
  const queryClient = useQueryClient()
  const [passphrase, setPassphrase] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  return (
    <Centered>
      <div className="flex items-center gap-3">
        <BrandLogo className="size-8" />
        <div className="flex flex-col">
          <h1>{m["security.gate.locked_title"]({ product: productName() })}</h1>
          <p>{m["security.gate.enter"]()}</p>
        </div>
      </div>
      <form
        className="flex flex-col gap-3"
        onSubmit={async (event) => {
          event.preventDefault()
          setBusy(true)
          setError(null)
          try {
            await unlock(passphrase)
            setPassphrase('')
            await queryClient.invalidateQueries()
            onUnlocked?.()
          } catch (e) {
            setError(e instanceof ApiError ? e.message : m["security.gate.unlock_failed"]())
            await queryClient.invalidateQueries({ queryKey: ['security'] })
          } finally {
            setBusy(false)
          }
        }}
      >
        <Input type="password" autoFocus autoComplete="current-password" aria-label={m["security.gate.passphrase"]()} placeholder={m["security.gate.passphrase"]()} value={passphrase} onChange={(e) => setPassphrase(e.target.value)} />
        {error && <p role="alert" className="not-typeset text-destructive">{error}</p>}
        {!error && retryAfter > 0 && <p role="status">{m["security.gate.retry"]({ seconds: retryAfter })}</p>}
        <Button type="submit" disabled={busy || passphrase.length === 0}>
          {m["security.gate.unlock"]()}
        </Button>
      </form>
      <p>{m["security.gate.explainer"]()}</p>
    </Centered>
  )
}

/** Shown when the data could not be opened: the key is missing, or the database
 * fails its check. The only way on is a backup. */
export function RecoveryScreen({ reason, pending }: { reason: string | null; pending: boolean }) {
  const [passphrase, setPassphrase] = useState('')
  const [file, setFile] = useState<File | undefined>()
  const [staged, setStaged] = useState<Staged | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const ready = staged !== null || pending

  return (
    <Centered>
      <div className="flex flex-col gap-1">
        <h1>{m["security.gate.recovery_title"]()}</h1>
        <p>{reason ?? m["security.gate.recovery_reason"]({ product: productName() })}</p>
        <p>{m["security.gate.recovery_body"]()}</p>
      </div>
      {ready ? (
        <div className="flex flex-col gap-3">
          <p role="status">
            {staged ? m["security.restore.staged"]({ date: formatDate(staged.createdAt, 'datetime'), documents: staged.documents }) : m["security.gate.backup_ready"]()} {m["security.gate.restart_to_finish"]()}
          </p>
          {isTauri() ? <Button onClick={() => void restartApp()}>{m["security.restore.restart"]()}</Button> : <p>{m["security.restore.restart_to_finish"]()}</p>}
        </div>
      ) : (
        <form
          className="flex flex-col gap-3"
          onSubmit={async (event) => {
            event.preventDefault()
            setBusy(true)
            setError(null)
            try {
              setStaged(await stageRestore(passphrase, file))
            } catch (e) {
              setError(e instanceof ApiError ? e.message : typeof e === 'string' ? e : m["security.gate.backup_open_failed"]())
            } finally {
              setBusy(false)
            }
          }}
        >
          {!isTauri() && <input type="file" accept=".dppbk" aria-label={m["security.restore.file"]()} onChange={(e) => setFile(e.target.files?.[0])} />}
          <Input type="password" aria-label={m["security.backup.passphrase"]()} placeholder={m["security.backup.passphrase"]()} value={passphrase} onChange={(e) => setPassphrase(e.target.value)} />
          {error && <p role="alert" className="not-typeset text-destructive">{error}</p>}
          <Button type="submit" disabled={busy || passphrase.length === 0 || (!isTauri() && !file)}>
            {isTauri() ? m["security.gate.choose_restore"]() : m["security.gate.restore_this"]()}
          </Button>
        </form>
      )}
    </Centered>
  )
}

/** Sits above the whole application. It shows the lock screen while the app is
 * locked, and the recovery screen when the data could not be opened. What is
 * behind it is not rendered, so a locked app shows nothing. */
export function SecurityGate({ children, onUnlocked }: { children: ReactNode; onUnlocked?: () => void }) {
  const { data: status, isError, refetch } = useSecurityStatus()

  useEffect(() => onLocked(() => void refetch()), [refetch])

  // Nothing renders until the answer is known, so a locked app never starts loading.
  // If the answer cannot be had at all, the app's own error handling takes over.
  if (!status) return isError ? <>{children}</> : null
  if (status.state === 'recovery') return <RecoveryScreen reason={status.reason} pending={status.restorePending} />
  if (status.locked) return <LockScreen retryAfter={status.retryAfterSeconds} onUnlocked={onUnlocked} />
  return <>{children}</>
}
