import { SelectField, TextField } from '@/components/form-fields'
import { AuthModeChoice } from '@/features/auth-policy'
import { localeNames } from '@/features/i18n'
import { jurisdictionPack } from '@/features/jurisdiction'
import { m } from '@/paraglide/messages'
import { Field, FieldDescription, FieldLabel } from '@pleadli/ui/field'
import { cn } from '@pleadli/ui/lib/utils'
import { useNumberingPreview } from './queries'
import type { Draft, FieldErrors } from './schema'

type StepProps = {
  draft: Draft
  errors: FieldErrors
  update: (patch: Partial<Draft>) => void
}

const pack = jurisdictionPack('ug')

/** One row of a fact the officer cannot change here, with what it does. */
function Fact({ label, value, purpose }: { label: string; value: string; purpose: string }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-md bg-muted/40 px-3 py-2">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-muted-foreground">{label}</span>
        <span>{value}</span>
      </div>
      <p>{purpose}</p>
    </div>
  )
}

export function IdentityStep({ draft, errors, update }: StepProps) {
  return (
    <div className="flex flex-col gap-4">
      <TextField label={m.setup_facility_name()} value={draft.name} onChange={(name) => update({ name })} error={errors.name} autoFocus autoComplete="off" placeholder={m.setup_facility_name_placeholder()} />
      <TextField
        label={m.setup_facility_code()}
        value={draft.facilityCode}
        onChange={(facilityCode) => update({ facilityCode })}
        error={errors.facilityCode}
        autoComplete="off"
        placeholder={pack.examples.facilityCode}
        description={m.setup_facility_code_description()}
      />
      <div className="grid grid-cols-2 gap-3">
        <TextField label={m.setup_location()} value={draft.location} onChange={(location) => update({ location })} autoComplete="off" placeholder={m.setup_location_placeholder()} />
        <SelectField label={m.setup_region()} value={draft.region} onChange={(region) => update({ region })} options={pack.regions.map((r) => ({ value: r, label: r }))} placeholder={m.setup_region_placeholder()} />
      </div>
      <div className="flex flex-col gap-2">
        <Fact label={m.setup_fact_jurisdiction()} value={pack.name} purpose={m.setup_fact_jurisdiction_purpose()} />
        <Fact label={m.setup_fact_language()} value={localeNames.en} purpose={m.setup_fact_language_purpose()} />
        <Fact label={m.setup_fact_timezone()} value={pack.timezone.label} purpose={m.setup_fact_timezone_purpose()} />
      </div>
    </div>
  )
}

export function ConventionsStep({ draft, errors, update }: StepProps) {
  const { data: preview } = useNumberingPreview(draft.numberingPattern, draft.numberingReset, draft.facilityCode)
  const year = new Date().getFullYear()
  const usingDefault = draft.numberingPattern.trim() === pack.numbering.pattern && draft.numberingReset === pack.numbering.reset
  const numberError = errors.numberingPattern ?? (preview && !preview.valid ? (preview.message ?? undefined) : undefined)

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1.5">
        <TextField
          label={m.setup_badge_prefix()}
          value={draft.badgePrefix}
          onChange={(badgePrefix) => update({ badgePrefix })}
          error={errors.badgePrefix}
          autoComplete="off"
          placeholder={m.setup_badge_prefix_placeholder()}
          description={m.setup_badge_prefix_description()}
        />
        <Preview label={m.setup_example_badge()} value={`${draft.badgePrefix.trim()}0142`} />
      </div>

      <div className="flex flex-col gap-1.5">
        <TextField
          label={m.setup_prisoner_numbers()}
          value={draft.numberingPattern}
          onChange={(numberingPattern) => update({ numberingPattern })}
          error={numberError}
          autoComplete="off"
          className="font-mono"
          description={m.setup_prisoner_numbers_description({ seq: '{SEQ:4}', year: '{YEAR}' })}
        />
        <SelectField
          label={m.setup_counter()}
          value={draft.numberingReset}
          onChange={(numberingReset) => update({ numberingReset: numberingReset as Draft['numberingReset'] })}
          options={[
            { value: 'yearly', label: m.setup_counter_yearly() },
            { value: 'never', label: m.setup_counter_never() },
          ]}
          placeholder={m.setup_counter_placeholder()}
        />
        {preview?.valid && <Preview label={m.setup_first_numbers()} value={preview.preview.join(', ')} />}
        {usingDefault && pack.numbering.provisional && (
          <p>{m.setup_numbering_provisional()}</p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <TextField
          label={m.setup_document_prefix()}
          value={draft.documentPrefix}
          onChange={(documentPrefix) => update({ documentPrefix })}
          error={errors.documentPrefix}
          autoComplete="off"
          description={m.setup_document_prefix_description()}
        />
        <Preview label={m.setup_example_document()} value={`${draft.documentPrefix.trim() || draft.facilityCode.trim() || 'CODE'}/${year}/0001`} />
      </div>
    </div>
  )
}

export function Preview({ label, value }: { label: string; value: string }) {
  return (
    <p className="flex items-baseline gap-2">
      {label}
      <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-foreground">{value}</span>
    </p>
  )
}

export function AdministratorStep({ draft, errors, update }: StepProps) {
  return (
    <div className="flex flex-col gap-4">
      <TextField
        label={m.setup_admin_badge()}
        value={draft.adminBadge}
        onChange={(adminBadge) => update({ adminBadge })}
        error={errors.adminBadge}
        autoFocus
        autoComplete="username"
        placeholder={`${draft.badgePrefix.trim()}0142`}
      />
      <TextField label={m.setup_admin_name()} value={draft.adminName} onChange={(adminName) => update({ adminName })} error={errors.adminName} autoComplete="name" />
      <TextField
        label={m.setup_admin_password()}
        type="password"
        value={draft.adminPassword}
        onChange={(adminPassword) => update({ adminPassword })}
        error={errors.adminPassword}
        autoComplete="new-password"
        description={m.setup_admin_password_description()}
      />
      <TextField label={m.setup_admin_password_again()} type="password" value={draft.adminPasswordAgain} onChange={(adminPasswordAgain) => update({ adminPasswordAgain })} error={errors.adminPasswordAgain} autoComplete="new-password" />
    </div>
  )
}

export function SignInStep({ draft, update }: Pick<StepProps, 'draft' | 'update'>) {
  return (
    <div className={cn('flex flex-col gap-3')}>
      <Field>
        <FieldLabel className="sr-only">{m.setup_signin_label()}</FieldLabel>
        <AuthModeChoice value={draft.authMode} onChange={(authMode) => update({ authMode })} />
        <FieldDescription>{m.setup_signin_hint()}</FieldDescription>
      </Field>
    </div>
  )
}
