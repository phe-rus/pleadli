import { SettingsCard } from '@/components/settings-card'
import { Tag } from '@/components/status-tag'
import { messageOf } from '@/lib/api'
import { useAppForm } from '@pleadli/forms-tables/forms'
import { Button } from '@pleadli/ui/button'
import { t } from '@pleadli/ui/goey-toaster'
import { useState } from 'react'
import { RecoveryCodeDialog } from './recovery-code-dialog'
import { useDisableLock, useLockNow, useLockStatus, useSetupLock } from './queries'
import { disableSchema, setupSchema } from './schema'

function SetupForm({ onSetUp }: { onSetUp: (recoveryCode: string) => void }) {
  const setupMutation = useSetupLock()
  const form = useAppForm({
    defaultValues: { pin: '', confirmPin: '' },
    validators: {
      onSubmit: ({ value }) => {
        const parsed = setupSchema.safeParse({ pin: value.pin })
        if (!parsed.success) return parsed.error.issues[0]?.message
        if (value.pin !== value.confirmPin) return 'The two PINs do not match.'
        return undefined
      },
    },
    onSubmit: async ({ value, formApi }) => {
      try {
        const result = await setupMutation.mutateAsync({ pin: value.pin })
        formApi.reset()
        onSetUp(result.recoveryCode)
      } catch (error) {
        t.error('Could not turn on app lock', { description: messageOf(error) })
      }
    },
  })

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault()
        void form.handleSubmit()
      }}
    >
      <form.AppField name="pin">{(f) => <f.input label="New PIN" type="password" />}</form.AppField>
      <form.AppField name="confirmPin">{(f) => <f.input label="Confirm PIN" type="password" />}</form.AppField>
      <form.Subscribe selector={(state) => [state.isSubmitting, state.isDirty] as const}>
        {([submitting, dirty]) => (
          <Button type="submit" size="sm" disabled={submitting || !dirty} className="self-start">
            Turn on
          </Button>
        )}
      </form.Subscribe>
    </form>
  )
}

function DisableForm() {
  const disableMutation = useDisableLock()
  const form = useAppForm({
    defaultValues: { pin: '' },
    validators: {
      onSubmit: ({ value }) => {
        const parsed = disableSchema.safeParse(value)
        return parsed.success ? undefined : parsed.error.issues[0]?.message
      },
    },
    onSubmit: async ({ value, formApi }) => {
      try {
        await disableMutation.mutateAsync(value)
        formApi.reset()
        t.success('App lock turned off')
      } catch (error) {
        t.error('Could not turn off app lock', { description: messageOf(error) })
      }
    },
  })

  return (
    <form
      className="flex items-end gap-2"
      onSubmit={(event) => {
        event.preventDefault()
        void form.handleSubmit()
      }}
    >
      <form.AppField name="pin">{(f) => <f.input label="Current PIN, to turn it off" type="password" />}</form.AppField>
      <form.Subscribe selector={(state) => [state.isSubmitting] as const}>
        {([submitting]) => (
          <Button type="submit" size="sm" variant="secondary" disabled={submitting}>
            Turn off
          </Button>
        )}
      </form.Subscribe>
    </form>
  )
}

/** What can be set here is set here; what App lock actually does (the five
 * minute idle timer, the focus loss relock) is described in words rather
 * than made configurable, since there is nothing here yet for an advocate to
 * tune. */
export function AppLockCard() {
  const { data: status } = useLockStatus()
  const lockNow = useLockNow()
  const [revealCode, setRevealCode] = useState<string | null>(null)

  return (
    <>
      <SettingsCard
        title="App lock"
        badge={status && (status.enabled ? <Tag tone="done">On</Tag> : <Tag tone="stopped">Off</Tag>)}
        description="A PIN over the whole app: required to open it, and again if it has sat idle for five minutes or lost focus for a moment. There is no other way back in if the PIN is forgotten, only the recovery code shown when you turn this on."
      >
        {status?.enabled ? (
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm text-muted-foreground">Lock it right now, without waiting.</p>
              <Button type="button" size="sm" variant="secondary" onClick={() => lockNow.mutate()}>
                Lock now
              </Button>
            </div>
            <DisableForm />
          </div>
        ) : (
          <SetupForm onSetUp={(code) => setRevealCode(code)} />
        )}
      </SettingsCard>
      {revealCode && <RecoveryCodeDialog code={revealCode} onClose={() => setRevealCode(null)} />}
    </>
  )
}
