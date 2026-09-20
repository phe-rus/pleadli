import { PreAuthLayout } from '@/components/pre-auth-layout'
import { ApiError } from '@/lib/api'
import { m } from '@/paraglide/messages'
import { LockKeyholeIcon, NetworkIcon, PrisonIcon, ProfileIcon, UserAdd01Icon } from '@hugeicons/core-free-icons'
import { t } from '@pleadli/ui/goey-toaster'
import { useState, type ReactNode } from 'react'
import { previewNumbering } from './data'
import { HeadOfficeStep } from './head-office-step'
import { useSetupFacility } from './queries'
import { adminSchema, conventionsSchema, errorsOf, identitySchema, initialDraft, type Draft, type FieldErrors } from './schema'
import { Progress, SetupScreen } from './setup-frame'
import { AdministratorStep, ConventionsStep, IdentityStep, SignInStep } from './setup-steps'

const steps = [
  { id: 'identity', icon: PrisonIcon, title: () => m.setup_identity_title(), description: () => m.setup_identity_description() },
  { id: 'conventions', icon: ProfileIcon, title: () => m.setup_conventions_title(), description: () => m.setup_conventions_description() },
  { id: 'administrator', icon: UserAdd01Icon, title: () => m.setup_admin_title(), description: () => m.setup_admin_description() },
  { id: 'sign-in', icon: LockKeyholeIcon, title: () => m.setup_signin_title(), description: () => m.setup_signin_description() },
  { id: 'head-office', icon: NetworkIcon, title: () => m.setup_ho_title(), description: () => m.setup_ho_description() },
] as const

/** First run of a facility, one decision per screen. Everything is held here
 * and saved together on the fourth screen, so leaving before then changes
 * nothing. The last screen comes after the facility exists: connecting to
 * Head Office is never needed to start working. */
export function FacilitySetup({ onBack, onCreated, onDone }: { onBack: () => void; onCreated: () => void; onDone: () => void }) {
  const [draft, setDraft] = useState<Draft>(initialDraft)
  const [errors, setErrors] = useState<FieldErrors>({})
  const [index, setIndex] = useState(0)
  const [checking, setChecking] = useState(false)
  const setup = useSetupFacility()
  const step = steps[index]
  const created = index === steps.length - 1

  const update = (patch: Partial<Draft>) => {
    setDraft((prev) => ({ ...prev, ...patch }))
    setErrors((prev) => ({ ...prev, ...Object.fromEntries(Object.keys(patch).map((key) => [key, undefined])) }))
  }

  const goTo = (next: number) => {
    // The document prefix starts as the facility code, which is what most
    // facilities want printed.
    if (next === 1 && !draft.documentPrefix.trim()) setDraft((prev) => ({ ...prev, documentPrefix: prev.facilityCode.trim() }))
    setErrors({})
    setIndex(next)
  }

  const next = async () => {
    if (index === 0) {
      const found = errorsOf(identitySchema.safeParse(draft))
      return Object.keys(found).length ? setErrors(found) : goTo(1)
    }
    if (index === 1) {
      const found = errorsOf(conventionsSchema.safeParse(draft))
      if (Object.keys(found).length) return setErrors(found)
      // The node decides whether a pattern is usable, with the rules that
      // apply once it is saved.
      setChecking(true)
      try {
        const result = await previewNumbering({ pattern: draft.numberingPattern, reset: draft.numberingReset, facilityNumber: draft.facilityCode })
        return result.valid ? goTo(2) : setErrors({ numberingPattern: result.message ?? m.setup_pattern_unusable() })
      } catch (error) {
        return t.error(m.setup_check_failed(), {
          description: error instanceof ApiError && error.status === 409 ? error.message : m.setup_check_failed_description(),
        })
      } finally {
        setChecking(false)
      }
    }
    if (index === 2) {
      const found = errorsOf(adminSchema(draft.badgePrefix).safeParse(draft))
      return Object.keys(found).length ? setErrors(found) : goTo(3)
    }
    if (index === 3) {
      try {
        await setup.mutateAsync(draft)
        onCreated()
        setErrors({})
        setIndex(4)
      } catch (error) {
        t.error(m.setup_failed(), { description: error instanceof ApiError ? error.message : m.setup_failed_description() })
      }
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
          onBack={created ? undefined : () => (index === 0 ? onBack() : goTo(index - 1))}
          action={created ? undefined : { label: index === 3 ? (setup.isPending ? m.setup_submitting() : m.setup_submit()) : m.onboarding_continue(), busy: checking || setup.isPending, onSubmit: () => void next() }}
        >
          <StepBody index={index} draft={draft} errors={errors} update={update} onDone={onDone} />
        </SetupScreen>
      </div>
    </PreAuthLayout>
  )
}

function StepBody({ index, draft, errors, update, onDone }: { index: number; draft: Draft; errors: FieldErrors; update: (patch: Partial<Draft>) => void; onDone: () => void }): ReactNode {
  switch (index) {
    case 0:
      return <IdentityStep draft={draft} errors={errors} update={update} />
    case 1:
      return <ConventionsStep draft={draft} errors={errors} update={update} />
    case 2:
      return <AdministratorStep draft={draft} errors={errors} update={update} />
    case 3:
      return <SignInStep draft={draft} update={update} />
    default:
      return <HeadOfficeStep onDone={onDone} />
  }
}
