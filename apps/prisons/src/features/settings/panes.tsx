import { DevRoleSwitch } from '@/components/dev-role-switch'
import { SelectField, TextField } from '@/components/form-fields'
import { SettingsCard } from '@/components/settings-card'
import { SettingsTable, type SettingsRow } from '@/components/settings-table'
import { Toggletheme } from '@/components/toggle-theme'
import { useVerifyActivationCode } from '@/features/activation'
import { FacilityProfileForm, useFacilityProfile, useSaveFacilityProfile } from '@/features/facility'
import { changeLocale, localeNames, selectableLocales } from '@/features/i18n'
import { jurisdictionPack } from '@/features/jurisdiction'
import { SignInPolicyPanel } from '@/features/auth-policy'
import { useHqConfig } from '@/features/session'
import { ApiError } from '@/lib/api'
import { m } from '@/paraglide/messages'
import { Button } from '@pleadli/ui/button'
import { t } from '@pleadli/ui/goey-toaster'
import { format } from 'date-fns/format'
import { useState } from 'react'

/** The facility's own identity, in the place an administrator looks for it. */
export function FacilityPane() {
  const { data: profile } = useFacilityProfile()
  return <FacilityProfileForm profile={profile} inline />
}

/** Head Office's identity, and whether Pleadli Cloud has verified it. The
 * verification is optional and never blocks anything. */
export function OrganisationPane() {
  const { data: profile } = useFacilityProfile()
  return (
    <div className="flex flex-col gap-6">
      <FacilityProfileForm profile={profile} inline organisation />
      <VerifyCard />
    </div>
  )
}

function VerifyCard() {
  const { data: hqConfig } = useHqConfig()
  const verify = useVerifyActivationCode()
  const [code, setCode] = useState('')
  const verified = hqConfig?.activatedAt != null

  return (
    <SettingsCard
      title={m.settings_verify_label()}
      description={verified ? m.settings_verify_yes({ date: format(hqConfig.activatedAt!, 'PP') }) : m.settings_verify_no()}
      onSubmit={
        verified
          ? undefined
          : async (event) => {
              event.preventDefault()
              try {
                await verify.mutateAsync(code.trim())
                setCode('')
                t.success(m.settings_verify_done())
              } catch {
                t.error(m.settings_verify_failed(), { description: m.settings_verify_failed_description() })
              }
            }
      }
      hint={verified ? undefined : m.settings_verify_hint()}
      action={
        verified ? undefined : (
          <Button type="submit" size="sm" disabled={!code.trim() || verify.isPending}>
            {m.settings_verify_submit()}
          </Button>
        )
      }
    >
      {!verified && <TextField label={m.settings_verify_code()} value={code} onChange={setCode} placeholder={m.settings_verify_placeholder()} autoComplete="off" />}
    </SettingsCard>
  )
}

/** Language is the installation's, so it is saved on the node and every
 * officer sees the same words. Jurisdiction and time zone are facts fixed at
 * setup. */
export function LanguagePane() {
  const { data: profile } = useFacilityProfile()
  const save = useSaveFacilityProfile()
  const pack = jurisdictionPack(profile.jurisdiction)
  const options = selectableLocales.map((locale) => ({ value: locale, label: localeNames[locale] }))

  const rows: SettingsRow[] = [
    {
      key: 'jurisdiction',
      label: m.settings_jurisdiction_label(),
      description: m.settings_jurisdiction_description(),
      control: pack.name,
    },
    {
      key: 'timezone',
      label: m.settings_timezone_label(),
      description: m.settings_timezone_description(),
      control: pack.timezone.label,
    },
  ]

  return (
    <div className="flex flex-col gap-6">
      <SettingsCard>
        <SelectField
          label={m.settings_language_label()}
          description={m.settings_language_description()}
          value={profile.language}
          placeholder={localeNames[profile.language as keyof typeof localeNames] ?? profile.language}
          options={options}
          onChange={async (language) => {
            try {
              await save.mutateAsync({
                name: profile.name ?? '',
                facilityNumber: profile.facilityNumber ?? '',
                location: profile.location ?? '',
                region: profile.region ?? '',
                approvedCapacity: profile.approvedCapacity != null ? String(profile.approvedCapacity) : '',
                language,
              })
              changeLocale(language)
              t.success(m.settings_language_saved())
            } catch (error) {
              t.error(m.settings_language_failed(), { description: error instanceof ApiError ? error.message : undefined })
            }
          }}
        />
      </SettingsCard>
      <SettingsTable rows={rows} />
    </div>
  )
}

export function AppearancePane() {
  const rows: SettingsRow[] = [{ key: 'appearance', label: m.settings_appearance_label(), description: m.settings_appearance_description(), control: <Toggletheme /> }]
  return (
    <div className="flex flex-col gap-6">
      <SettingsTable rows={rows} />
      {import.meta.env.DEV && <DevRoleSwitch compact={false} />}
    </div>
  )
}

/** Sign-in policy, and the plain truth about what protects the data on this
 * computer, so the screen never implies more than is true. */
export function SecurityPane() {
  const rows: SettingsRow[] = [{ key: 'disk', label: m.settings_security_label(), description: m.settings_security_description(), control: null }]
  return (
    <div className="flex flex-col gap-8">
      <SignInPolicyPanel />
      <SettingsTable rows={rows} />
    </div>
  )
}
