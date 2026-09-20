import { SelectField } from '@/components/form-fields'
import { SettingsCard } from '@/components/settings-card'
import { ApiError } from '@/lib/api'
import { Button } from '@pleadli/ui/button'
import { t } from '@pleadli/ui/goey-toaster'
import { useState } from 'react'
import { AuthModeChoice } from './auth-mode-choice'
import { useAuthPolicy, useSaveAuthPolicy } from './queries'
import { idleOptions, lifetimeOptions, type AuthPolicy } from './schema'
import { m } from '@/paraglide/messages'

/** Settings > Sign-in. Facility-owned: how officers prove who they are and
 * how long a sign-in lasts. Changes are audited and end no one's session
 * unless they lose the right to the way they signed in. */
export function SignInPolicyPanel() {
  const { data: policy } = useAuthPolicy()
  if (!policy) return null
  return <PolicyForm key={policy.updatedAt ?? 0} policy={policy} />
}

function PolicyForm({ policy }: { policy: AuthPolicy }) {
  const save = useSaveAuthPolicy()
  const [mode, setMode] = useState(policy.mode)
  const [idle, setIdle] = useState(String(policy.idleTimeoutMinutes))
  const [lifetime, setLifetime] = useState(String(policy.absoluteLifetimeHours))
  const changed = mode !== policy.mode || Number(idle) !== policy.idleTimeoutMinutes || Number(lifetime) !== policy.absoluteLifetimeHours

  return (
    <SettingsCard
      title={m.auth_policy_how_officers_sign_in()}
      onSubmit={async (event) => {
        event.preventDefault()
        try {
          await save.mutateAsync({ mode, idleTimeoutMinutes: Number(idle), absoluteLifetimeHours: Number(lifetime) })
          t.success(m.auth_policy_sign_in_settings_saved())
        } catch (error) {
          t.error(m.auth_policy_could_not_save_the_sign_in(), { description: error instanceof ApiError ? error.message : m.auth_policy_please_try_again() })
        }
      }}
      hint={policy.mode === 'badge_only' && mode !== 'badge_only' ? m.auth_policy_accounts_that_sign_in_with_their() : m.auth_policy_changes_are_audited()}
      action={
        <Button type="submit" size="sm" disabled={!changed || save.isPending}>
          {m.auth_policy_save_sign_in_settings()}
        </Button>
      }
    >
      <AuthModeChoice value={mode} onChange={setMode} />
      <SelectField label={m.auth_policy_sign_out_after_inactivity()} value={idle} onChange={setIdle} options={idleOptions} placeholder={m.auth_policy_choose()} />
      <SelectField label={m.auth_policy_longest_a_sign_in_lasts()} value={lifetime} onChange={setLifetime} options={lifetimeOptions} placeholder={m.auth_policy_choose()} />
    </SettingsCard>
  )
}
