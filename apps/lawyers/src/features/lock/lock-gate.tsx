import * as m from '@/paraglide/messages'
import { messageOf } from '@/lib/api'
import { LockKeyIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useAppForm } from '@pleadli/forms-tables/forms'
import { Button } from '@pleadli/ui/button'
import { t } from '@pleadli/ui/goey-toaster'
import { PropsWithChildren, useState } from 'react'
import { useLockStatus, useRecoverPin, useUnlock } from './queries'
import { recoverSchema } from './schema'
import { PinField } from '@pleadli/ui/pin-field'
import { useIdleLock } from './use-idle-lock'

function UnlockForm({ cooldownRemaining }: { cooldownRemaining: number | null }) {
  const unlockMutation = useUnlock()
  const [pin, setPin] = useState('')
  const [failures, setFailures] = useState(0)
  const unlock = async (value: string) => {
    try {
      await unlockMutation.mutateAsync({ pin: value })
    } catch (error) {
      setFailures((n) => n + 1)
      t.error(m["lock.unlock_failed"](), { description: messageOf(error) })
    } finally {
      setPin('')
    }
  }

  // Six places that fill as the PIN is typed; the sixth unlocks, as on an iPhone.
  return (
    <div className="flex flex-col items-center gap-3">
      <PinField label={m["lock.pin"]()} value={pin} onChange={setPin} onComplete={(v) => void unlock(v)} autoFocus disabled={unlockMutation.isPending || cooldownRemaining != null} error={failures} />
      <p className="min-h-5 text-[0.8125rem] text-muted-foreground">{cooldownRemaining != null ? m["lock.wait"]({ seconds: String(cooldownRemaining) }) : ''}</p>
    </div>
  )
}

function RecoverForm({ onRecovered }: { onRecovered: (recoveryCode: string) => void }) {
  const recoverMutation = useRecoverPin()
  const form = useAppForm({
    defaultValues: { recoveryCode: '', newPin: '' },
    validators: {
      onSubmit: ({ value }) => {
        const parsed = recoverSchema.safeParse(value)
        return parsed.success ? undefined : parsed.error.issues[0]?.message
      },
    },
    onSubmit: async ({ value }) => {
      try {
        const result = await recoverMutation.mutateAsync(value)
        onRecovered(result.recoveryCode)
      } catch (error) {
        t.error(m["lock.reset_failed"](), { description: messageOf(error) })
      }
    },
  })

  return (
    <form
      className="flex w-full max-w-xs flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault()
        void form.handleSubmit()
      }}
    >
      <form.AppField name="recoveryCode">{(f) => <f.input label={m["lock.recovery_code"]()} placeholder="XXXX-XXXX-XXXX-XXXX-XXXX" />}</form.AppField>
      <form.AppField name="newPin">{(f) => <f.input label={m["lock.new_pin"]()} type="password" />}</form.AppField>
      <form.Subscribe selector={(state) => [state.isSubmitting] as const}>
        {([submitting]) => (
          <Button type="submit" disabled={submitting}>
            {m["lock.reset"]()}
          </Button>
        )}
      </form.Subscribe>
    </form>
  )
}

/** Wraps the whole app shell. Nothing behind this gate is reachable while
 * locked, not because the routes hide (they still would if someone called
 * the API directly), but because the backend itself refuses them; this
 * component only decides what the screen shows.
 *
 * A locked app with no PIN set at all (never turned on) never shows this
 * screen: `enabled` is checked first. */
export function LockGate({ children }: PropsWithChildren) {
  const { data: status, isLoading } = useLockStatus()
  const [mode, setMode] = useState<'unlock' | 'recover' | 'recovered'>('unlock')
  const [newRecoveryCode, setNewRecoveryCode] = useState('')
  useIdleLock(Boolean(status?.enabled && !status.locked))

  if (isLoading || !status) {
    return <div className="h-svh w-full bg-background" />
  }

  if (!status.enabled || !status.locked) {
    return <>{children}</>
  }

  if (mode === 'recovered') {
    return (
      <article className="flex h-svh w-full flex-col items-center justify-center gap-6 bg-background">
        <div className="flex flex-col items-center gap-2 text-center">
          <h1 className="text-xl">{m["lock.your_code"]()}</h1>
          <p className="max-w-xs text-sm text-muted-foreground">
            {m["lock.code_note"]()}
          </p>
        </div>
        <div className="rounded-md border bg-muted/40 p-3 font-mono text-sm">{newRecoveryCode}</div>
        <Button type="button" onClick={() => setMode('unlock')}>
          {m["lock.continue"]()}
        </Button>
      </article>
    )
  }

  return (
    <article className="flex h-svh w-full flex-col items-center justify-center gap-6 bg-background">
      <div className="flex flex-col items-center gap-2">
        <HugeiconsIcon icon={LockKeyIcon} className="size-10 text-muted-foreground" />
        <h1 className="text-xl">{m["lock.title"]()}</h1>
        <p className="text-sm text-muted-foreground">{mode === 'recover' ? m["lock.enter_recovery"]() : m["lock.enter_pin"]()}</p>
      </div>
      {mode === 'recover' ? (
        <RecoverForm
          onRecovered={(code) => {
            setNewRecoveryCode(code)
            setMode('recovered')
          }}
        />
      ) : (
        <UnlockForm cooldownRemaining={status.cooldownRemaining} />
      )}
      <Button type="button" variant="ghost" size="sm" onClick={() => setMode(mode === 'recover' ? 'unlock' : 'recover')}>
        {mode === 'recover' ? m["lock.back"]() : m["lock.forgot"]()}
      </Button>
    </article>
  )
}
