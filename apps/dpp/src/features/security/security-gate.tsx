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
import { JusticeScale01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { format } from 'date-fns/format'
import { isTauri } from '@tauri-apps/api/core'

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

function LockScreen({ retryAfter, onUnlocked }: { retryAfter: number; onUnlocked?: () => void }) {
  const queryClient = useQueryClient()
  const [passphrase, setPassphrase] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  return (
    <Centered>
      <div className="flex items-center gap-3">
        <HugeiconsIcon icon={JusticeScale01Icon} className="size-6 text-primary" />
        <div className="flex flex-col">
          <h1>Pleadli DPP is locked</h1>
          <p>Enter the passphrase to continue.</p>
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
            setError(e instanceof ApiError ? e.message : 'It could not be unlocked.')
            await queryClient.invalidateQueries({ queryKey: ['security'] })
          } finally {
            setBusy(false)
          }
        }}
      >
        <Input type="password" autoFocus autoComplete="current-password" aria-label="Passphrase" placeholder="Passphrase" value={passphrase} onChange={(e) => setPassphrase(e.target.value)} />
        {error && <p role="alert" className="text-destructive">{error}</p>}
        {!error && retryAfter > 0 && <p role="status">Too many wrong attempts. Try again in {retryAfter} seconds.</p>}
        <Button type="submit" disabled={busy || passphrase.length === 0}>
          Unlock
        </Button>
      </form>
      <p>Locking protects the screen. The records on this computer are encrypted whether or not a lock is set.</p>
    </Centered>
  )
}

/** Shown when the data could not be opened: the key is missing, or the database
 * fails its check. The only way on is a backup. */
function RecoveryScreen({ reason, pending }: { reason: string | null; pending: boolean }) {
  const [passphrase, setPassphrase] = useState('')
  const [file, setFile] = useState<File | undefined>()
  const [staged, setStaged] = useState<Staged | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const ready = staged !== null || pending

  return (
    <Centered>
      <div className="flex flex-col gap-1">
        <h1>The data could not be opened</h1>
        <p>{reason ?? 'Pleadli DPP could not open its records.'}</p>
        <p>Nothing has been changed or deleted. Restoring a backup brings the records back; the data as it is now is kept aside.</p>
      </div>
      {ready ? (
        <div className="flex flex-col gap-3">
          <p role="status">
            {staged ? `A backup made ${format(staged.createdAt, 'PPp')} with ${staged.documents} documents is ready.` : 'A backup is ready to be restored.'} Restart to finish.
          </p>
          {isTauri() ? <Button onClick={() => void restartApp()}>Restart and restore</Button> : <p>Restart the application to finish.</p>}
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
              setError(e instanceof ApiError ? e.message : typeof e === 'string' ? e : 'The backup could not be opened.')
            } finally {
              setBusy(false)
            }
          }}
        >
          {!isTauri() && <input type="file" accept=".dppbk" aria-label="Backup file" onChange={(e) => setFile(e.target.files?.[0])} />}
          <Input type="password" aria-label="Backup passphrase" placeholder="Backup passphrase" value={passphrase} onChange={(e) => setPassphrase(e.target.value)} />
          {error && <p role="alert" className="text-destructive">{error}</p>}
          <Button type="submit" disabled={busy || passphrase.length === 0 || (!isTauri() && !file)}>
            {isTauri() ? 'Choose a backup and restore' : 'Restore this backup'}
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
