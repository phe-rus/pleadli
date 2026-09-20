import { PreAuthLayout } from '@/components/pre-auth-layout'
import { TextField } from '@/components/form-fields'
import { ApiError } from '@/lib/api'
import { m } from '@/paraglide/messages'
import { NetworkIcon, ProfileIcon, UserAdd01Icon } from '@hugeicons/core-free-icons'
import { t } from '@pleadli/ui/goey-toaster'
import { useState, type ReactNode } from 'react'
import { useSetupHeadOffice } from './queries'
import { adminSchema, errorsOf, headOfficeConventionsSchema, headOfficeIdentitySchema, initialDraft, type Draft, type FieldErrors } from './schema'
import { Progress, SetupScreen } from './setup-frame'
import { AdministratorStep, Preview } from './setup-steps'

const steps = [
  { id: 'identity', icon: NetworkIcon, title: () => m.hqsetup_identity_title(), description: () => m.hqsetup_identity_description() },
  { id: 'conventions', icon: ProfileIcon, title: () => m.hqsetup_conventions_title(), description: () => m.hqsetup_conventions_description() },
  { id: 'administrator', icon: UserAdd01Icon, title: () => m.hqsetup_admin_title(), description: () => m.hqsetup_admin_description() },
] as const

/** First run of Head Office, standing alone: no code from Pleadli Cloud, no
 * facility to connect. Held here and saved together on the last screen, so
 * leaving before then changes nothing. Verifying with Pleadli is a later,
 * optional step in Settings. */
export function HeadOfficeSetup({ onBack }: { onBack: () => void }) {
  const [draft, setDraft] = useState<Draft>(initialDraft)
  const [errors, setErrors] = useState<FieldErrors>({})
  const [index, setIndex] = useState(0)
  const setup = useSetupHeadOffice()
  const step = steps[index]
  const last = index === steps.length - 1

  const update = (patch: Partial<Draft>) => {
    setDraft((prev) => ({ ...prev, ...patch }))
    setErrors((prev) => ({ ...prev, ...Object.fromEntries(Object.keys(patch).map((key) => [key, undefined])) }))
  }

  const goTo = (to: number) => {
    if (to === 1 && !draft.documentPrefix.trim()) setDraft((prev) => ({ ...prev, documentPrefix: prev.facilityCode.trim() }))
    setErrors({})
    setIndex(to)
  }

  const next = async () => {
    if (index === 0) {
      const found = errorsOf(headOfficeIdentitySchema.safeParse(draft))
      return Object.keys(found).length ? setErrors(found) : goTo(1)
    }
    if (index === 1) {
      const found = errorsOf(headOfficeConventionsSchema.safeParse(draft))
      return Object.keys(found).length ? setErrors(found) : goTo(2)
    }
    const found = errorsOf(adminSchema(draft.badgePrefix).safeParse(draft))
    if (Object.keys(found).length) return setErrors(found)
    try {
      await setup.mutateAsync(draft)
    } catch (error) {
      t.error(m.hqsetup_failed(), { description: error instanceof ApiError ? error.message : m.setup_failed_description() })
    }
  }

  return (
    <PreAuthLayout>
      <div className="flex w-full max-w-md flex-col gap-6">
        <Progress index={index} total={steps.length} />
        <SetupScreen
          stepId={step.id}
          icon={step.icon}
          title={step.title()}
          description={step.description()}
          onBack={() => (index === 0 ? onBack() : goTo(index - 1))}
          action={{ label: last ? (setup.isPending ? m.hqsetup_submitting() : m.hqsetup_submit()) : m.onboarding_continue(), busy: setup.isPending, onSubmit: () => void next() }}
        >
          <StepBody index={index} draft={draft} errors={errors} update={update} />
        </SetupScreen>
      </div>
    </PreAuthLayout>
  )
}

function StepBody({ index, draft, errors, update }: { index: number; draft: Draft; errors: FieldErrors; update: (patch: Partial<Draft>) => void }): ReactNode {
  if (index === 0) {
    return (
      <div className="flex flex-col gap-4">
        <TextField label={m.hqsetup_name()} value={draft.name} onChange={(name) => update({ name })} error={errors.name} autoFocus autoComplete="off" placeholder={m.hqsetup_name_placeholder()} />
        <TextField label={m.hqsetup_code()} value={draft.facilityCode} onChange={(facilityCode) => update({ facilityCode })} error={errors.facilityCode} autoComplete="off" placeholder="UPS-HQ" description={m.hqsetup_code_description()} />
        <TextField label={m.setup_location()} value={draft.location} onChange={(location) => update({ location })} autoComplete="off" placeholder={m.hqsetup_location_placeholder()} />
        <p>{m.hqsetup_verify_note()}</p>
      </div>
    )
  }
  if (index === 1) {
    const year = new Date().getFullYear()
    return (
      <div className="flex flex-col gap-5">
        <div className="flex flex-col gap-1.5">
          <TextField label={m.setup_badge_prefix()} value={draft.badgePrefix} onChange={(badgePrefix) => update({ badgePrefix })} error={errors.badgePrefix} autoComplete="off" placeholder={m.setup_badge_prefix_placeholder()} description={m.setup_badge_prefix_description()} />
          <Preview label={m.setup_example_badge()} value={`${draft.badgePrefix.trim()}0142`} />
        </div>
        <div className="flex flex-col gap-1.5">
          <TextField label={m.setup_document_prefix()} value={draft.documentPrefix} onChange={(documentPrefix) => update({ documentPrefix })} error={errors.documentPrefix} autoComplete="off" description={m.setup_document_prefix_description()} />
          <Preview label={m.setup_example_document()} value={`${draft.documentPrefix.trim() || draft.facilityCode.trim() || 'CODE'}/${year}/0001`} />
        </div>
      </div>
    )
  }
  return <AdministratorStep draft={draft} errors={errors} update={update} />
}
