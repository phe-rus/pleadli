import { messageOf } from '@/lib/api'
import { LockKeyIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useAppForm } from '@pleadli/forms-tables/forms'
import { Button } from '@pleadli/ui/button'
import { t } from '@pleadli/ui/goey-toaster'
import { PropsWithChildren, useState } from 'react'
import { useLockStatus, useRecoverPin, useUnlock } from './queries'
import { recoverSchema, unlockSchema } from './schema'
import { useIdleLock } from './use-idle-lock'

function UnlockForm({ cooldownRemaining }: { cooldownRemaining: number | null }) {
  const unlockMutation = useUnlock()
  const form = useAppForm({
    defaultValues: { pin: '' },
    validators: {
      onSubmit: ({ value }) => {
        const parsed = unlockSchema.safeParse(value)
        return parsed.success ? undefined : parsed.error.issues[0]?.message
      },
    },
    onSubmit: async ({ value, formApi }) => {
      try {
        await unlockMutation.mutateAsync(value)
        formApi.reset()
      } catch (error) {
        t.error('Could not unlock', { description: messageOf(error) })
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
      <form.AppField name="pin">{(f) => <f.input label="PIN" type="password" autoFocus />}</form.AppField>
      <form.Subscribe selector={(state) => [state.isSubmitting] as const}>
        {([submitting]) => (
          <Button type="submit" disabled={submitting || cooldownRemaining != null}>
            {cooldownRemaining != null ? `Wait ${cooldownRemaining}s` : 'Unlock'}
          </Button>
        )}
      </form.Subscribe>
    </form>
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
        t.error('Could not reset your PIN', { description: messageOf(error) })
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
      <form.AppField name="recoveryCode">{(f) => <f.input label="Recovery code" placeholder="XXXX-XXXX-XXXX-XXXX-XXXX" />}</form.AppField>
      <form.AppField name="newPin">{(f) => <f.input label="New PIN" type="password" />}</form.AppField>
      <form.Subscribe selector={(state) => [state.isSubmitting] as const}>
        {([submitting]) => (
          <Button type="submit" disabled={submitting}>
            Reset PIN
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
          <h1 className="text-xl">Your recovery code</h1>
          <p className="max-w-xs text-sm text-muted-foreground">
            Your PIN was reset. Save this new code somewhere safe, it replaces the old one and will not be shown again.
          </p>
        </div>
        <div className="rounded-md border bg-muted/40 p-3 font-mono text-sm">{newRecoveryCode}</div>
        <Button type="button" onClick={() => setMode('unlock')}>
          Continue to unlock
        </Button>
      </article>
    )
  }

  return (
    <article className="flex h-svh w-full flex-col items-center justify-center gap-6 bg-background">
      <div className="flex flex-col items-center gap-2">
        <HugeiconsIcon icon={LockKeyIcon} className="size-10 text-muted-foreground" />
        <h1 className="text-xl">Pleadli Lawyers is locked</h1>
        <p className="text-sm text-muted-foreground">{mode === 'recover' ? 'Enter your recovery code and a new PIN.' : 'Enter your PIN to continue.'}</p>
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
        {mode === 'recover' ? 'Back to PIN entry' : 'Forgot your PIN?'}
      </Button>
    </article>
  )
}
