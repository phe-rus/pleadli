import * as m from '@/paraglide/messages'
import { ArrowLeft01Icon, ArrowRight01Icon, LockKeyholeIcon, NetworkIcon, PoliceBadgeIcon, UserAdd01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Button } from '@pleadli/ui/button'
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@pleadli/ui/field'
import { Input } from '@pleadli/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@pleadli/ui/select'
import { AnimatePresence, motion } from 'framer-motion'
import { useRef, useState, type ComponentProps, type ReactNode } from 'react'
import { ApiError } from '@/lib/api'
import { setupCommand, setupStation } from './data'
import { PreAuthLayout, Progress, ScreenHeader, screenTransition, type Mode } from './pre-auth-layout'
import { commandLevels, type Installation } from './schema'
import { SetupProgress } from './setup-progress'

type Choice = 'choose' | Mode

function LabelledInput({ label, hint, error, ...props }: { label: string; hint?: string; error?: string } & ComponentProps<typeof Input>) {
  return (
    <Field>
      <FieldLabel>{label}</FieldLabel>
      <Input aria-invalid={error ? true : undefined} {...props} />
      {error ? (
        <p role="alert" className="text-destructive">
          {error}
        </p>
      ) : (
        hint && <FieldDescription>{hint}</FieldDescription>
      )}
    </Field>
  )
}

/** First launch: the one question, then that side's setup. The answer is made
 * once and cannot be changed afterwards. */
export function Onboarding({ installation, onDone }: { installation: Installation; onDone: () => void }) {
  const [choice, setChoice] = useState<Choice>('choose')
  const back = () => setChoice('choose')

  if (choice === 'station') return <StationSetup installation={installation} onBack={back} onDone={onDone} />
  if (choice === 'command') return <CommandSetup installation={installation} onBack={back} onDone={onDone} />

  return (
    <PreAuthLayout>
      <motion.div {...screenTransition} className="flex w-full max-w-sm flex-col gap-7">
        <ScreenHeader icon={PoliceBadgeIcon} title={m["onboarding.title"]()} description={m["onboarding.desc"]()} />
        <div className="flex flex-col gap-2.5">
          <Option
            icon={PoliceBadgeIcon}
            iconTint="text-primary"
            title={m["onboarding.station_title"]()}
            description={m["onboarding.station_desc"]()}
            onClick={() => setChoice('station')}
            delay={0.1}
          />
          <Option
            icon={NetworkIcon}
            iconTint="text-amber-600 dark:text-amber-400"
            title={m["onboarding.command_title"]()}
            description={m["onboarding.command_desc"]()}
            onClick={() => setChoice('command')}
            delay={0.16}
          />
        </div>
      </motion.div>
    </PreAuthLayout>
  )
}

function Option({ icon, iconTint, title, description, onClick, delay }: { icon: typeof PoliceBadgeIcon; iconTint: string; title: string; description: string; onClick: () => void; delay: number }) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.25 }}
      whileHover={{ y: -1 }}
      whileTap={{ scale: 0.99 }}
      className="group flex cursor-pointer items-center gap-3 rounded-lg border border-border bg-card px-4 py-3.5 text-left shadow-xs ring-1 ring-transparent transition-colors hover:border-primary/40 hover:ring-primary/10"
    >
      <div className={`flex size-10 shrink-0 items-center justify-center rounded-md bg-muted transition-colors group-hover:bg-primary/10 ${iconTint}`}>
        <HugeiconsIcon icon={icon} size={19} />
      </div>
      <div className="flex flex-1 flex-col gap-0.5">
        <span className="text-sm font-medium text-foreground">{title}</span>
        <span className="text-xs text-muted-foreground">{description}</span>
      </div>
      <HugeiconsIcon icon={ArrowRight01Icon} size={16} className="shrink-0 text-muted-foreground/50 transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
    </motion.button>
  )
}

/** One screen of a setup wizard: back link, header, the step's body and its
 * button. Both first-run flows are made of these, so they move and read the
 * same. */
function SetupScreen({
  stepId,
  icon,
  title,
  description,
  onBack,
  action,
  error,
  children,
}: {
  stepId: string
  icon: typeof PoliceBadgeIcon
  title: string
  description: string
  onBack: () => void
  action: { label: string; busy: boolean; onSubmit: () => void }
  error: string | null
  children: ReactNode
}) {
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.form
        key={stepId}
        {...screenTransition}
        className="flex flex-col gap-6"
        onSubmit={(event) => {
          event.preventDefault()
          action.onSubmit()
        }}
      >
        <button type="button" onClick={onBack} className="-ml-1 flex w-fit cursor-pointer items-center gap-1 rounded-sm text-muted-foreground transition-colors hover:text-foreground">
          <HugeiconsIcon icon={ArrowLeft01Icon} size={14} />
          {m["common.back"]()}
        </button>
        <ScreenHeader icon={icon} title={title} description={description} />
        <FieldGroup>{children}</FieldGroup>
        {error && (
          <p role="alert" className="text-destructive">
            {error}
          </p>
        )}
        <Button type="submit" className="w-full" disabled={action.busy}>
          {action.label}
        </Button>
      </motion.form>
    </AnimatePresence>
  )
}

type Administrator = { existingOfficerId: string | null; name: string; rank: string; badgeNumber: string; password: string; passwordAgain: string }
type Errors = Partial<Record<'name' | 'badge' | 'password' | 'passwordAgain', string>>

const emptyAdministrator: Administrator = { existingOfficerId: null, name: '', rank: '', badgeNumber: '', password: '', passwordAgain: '' }

const label = (o: { rank: string | null; name: string }) => [o.rank, o.name].filter(Boolean).join(' ')

/** Who runs this installation. An installation that already has officers is
 * asked to choose one of them; otherwise a new administrator is made. */
function AdministratorFields({ installation, value, onChange, withPassword, errors }: { installation: Installation; value: Administrator; onChange: (next: Administrator) => void; withPassword: boolean; errors: Errors }) {
  const existing = installation.existingOfficers
  const set = (patch: Partial<Administrator>) => onChange({ ...value, ...patch })

  return (
    <>
      {existing.length > 0 && (
        <Field>
          <FieldLabel>{m["onboarding.administrator"]()}</FieldLabel>
          <Select
            items={[{ value: '', label: m["onboarding.someone_new"]() }, ...existing.map((o) => ({ value: o.id, label: label(o) }))]}
            value={value.existingOfficerId ?? ''}
            onValueChange={(id) => {
              const picked = existing.find((o) => o.id === id)
              set({ existingOfficerId: id ? String(id) : null, badgeNumber: picked?.badgeNumber ?? '' })
            }}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder={m["onboarding.choose_officer"]()} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">{m["onboarding.someone_new"]()}</SelectItem>
              {existing.map((o) => (
                <SelectItem key={o.id} value={o.id}>
                  {label(o)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <FieldDescription>{m["onboarding.existing_hint"]()}</FieldDescription>
        </Field>
      )}
      {!value.existingOfficerId && (
        <div className="grid grid-cols-2 gap-3">
          <LabelledInput label={m["common.full_name"]()} autoFocus autoComplete="name" error={errors.name} value={value.name} onChange={(e) => set({ name: e.target.value })} />
          <LabelledInput label={m["common.rank"]()} value={value.rank} onChange={(e) => set({ rank: e.target.value })} />
        </div>
      )}
      <LabelledInput label={m["common.badge_number"]()} autoComplete="username" error={errors.badge} value={value.badgeNumber} onChange={(e) => set({ badgeNumber: e.target.value })} />
      {withPassword && (
        <>
          <LabelledInput label={m["common.password"]()} type="password" autoComplete="new-password" hint={m["onboarding.password_hint"]()} error={errors.password} value={value.password} onChange={(e) => set({ password: e.target.value })} />
          <LabelledInput label={m["onboarding.password_again"]()} type="password" autoComplete="new-password" error={errors.passwordAgain} value={value.passwordAgain} onChange={(e) => set({ passwordAgain: e.target.value })} />
        </>
      )}
    </>
  )
}

function administratorErrors(value: Administrator, withPassword: boolean): Errors {
  const errors: Errors = {}
  if (!value.existingOfficerId && !value.name.trim()) errors.name = m["onboarding.err_name"]()
  if (!value.badgeNumber.trim()) errors.badge = m["onboarding.err_badge"]()
  if (withPassword) {
    if (value.password.length < 8) errors.password = m["onboarding.err_password"]()
    else if (value.password !== value.passwordAgain) errors.passwordAgain = m["onboarding.err_mismatch"]()
  }
  return errors
}

function messageOf(e: unknown) {
  return e instanceof ApiError ? e.message : e instanceof Error ? e.message : m["onboarding.err_setup"]()
}

/** Both sides are two screens: the place, then who runs it. Nothing is saved
 * until the last button, so leaving before then changes nothing. */
function SetupWizard({
  mode,
  installation,
  steps,
  administrator,
  setAdministrator,
  withPassword,
  validate,
  submit,
  submitLabel,
  onBack,
  onDone,
}: {
  mode: Mode
  installation: Installation
  steps: { id: string; icon: typeof PoliceBadgeIcon; title: string; description: string; body: ReactNode }[]
  administrator: Administrator
  setAdministrator: (next: Administrator) => void
  withPassword: boolean
  validate: () => string | null
  submit: () => Promise<unknown>
  submitLabel: string
  onBack: () => void
  onDone: () => void
}) {
  const [index, setIndex] = useState(0)
  const [errors, setErrors] = useState<Errors>({})
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const submitting = useRef(false)
  const last = index === steps.length
  const step = last ? null : steps[index]

  const finish = async () => {
    // Setup is accepted once. A second click while the first is still being
    // saved would be refused as "already set up", so it is ignored here.
    if (submitting.current) return
    const found = administratorErrors(administrator, withPassword)
    setErrors(found)
    if (Object.keys(found).length) return
    submitting.current = true
    setBusy(true)
    setError(null)
    try {
      await submit()
      // Stay on the progress screen: the gate replaces it once the workspace
      // is ready, so the form never comes back to be pressed again.
      onDone()
    } catch (e) {
      setError(messageOf(e))
      submitting.current = false
      setBusy(false)
    }
  }

  if (busy) return <SetupProgress mode={mode} title={mode === 'command' ? m["onboarding.setting_up_command"]() : m["onboarding.setting_up_station"]()} />

  return (
    <PreAuthLayout mode={mode}>
      <div className="flex w-full max-w-md flex-col gap-6">
        <Progress index={index} total={steps.length + 1} />
        {step ? (
          <SetupScreen
            stepId={step.id}
            icon={step.icon}
            title={step.title}
            description={step.description}
            onBack={() => (index === 0 ? onBack() : setIndex(index - 1))}
            error={error}
            action={{
              label: m["onboarding.continue"](),
              busy: false,
              onSubmit: () => {
                const problem = validate()
                setError(problem)
                if (!problem) setIndex(index + 1)
              },
            }}
          >
            {step.body}
          </SetupScreen>
        ) : (
          <SetupScreen
            stepId="administrator"
            icon={withPassword ? LockKeyholeIcon : UserAdd01Icon}
            title={m["onboarding.who_runs"]()}
            description={mode === 'command' ? m["onboarding.who_runs_password"]() : m["onboarding.who_runs_badge"]()}
            onBack={() => setIndex(index - 1)}
            error={error}
            action={{ label: submitLabel, busy, onSubmit: () => void finish() }}
          >
            <AdministratorFields installation={installation} value={administrator} onChange={setAdministrator} withPassword={withPassword} errors={errors} />
          </SetupScreen>
        )}
      </div>
    </PreAuthLayout>
  )
}

function StationSetup({ installation, onBack, onDone }: { installation: Installation; onBack: () => void; onDone: () => void }) {
  const [stationName, setStationName] = useState('')
  const [region, setRegion] = useState('')
  const [district, setDistrict] = useState('')
  const [division, setDivision] = useState('')
  const [administrator, setAdministrator] = useState<Administrator>(emptyAdministrator)

  return (
    <SetupWizard
      mode="station"
      installation={installation}
      administrator={administrator}
      setAdministrator={setAdministrator}
      withPassword
      validate={() => (stationName.trim() ? null : m["onboarding.err_station_name"]())}
      submit={() => setupStation({ stationName, region, district, division, administrator })}
      submitLabel={m["onboarding.submit_station"]()}
      onBack={onBack}
      onDone={onDone}
      steps={[
        {
          id: 'station',
          icon: PoliceBadgeIcon,
          title: m["onboarding.name_station"](),
          description: m["onboarding.name_station_desc"](),
          body: (
            <>
              <LabelledInput label={m["command.station_name"]()} autoFocus placeholder={m["charge_sheet.station_placeholder"]()} value={stationName} onChange={(e) => setStationName(e.target.value)} />
              <div className="grid grid-cols-3 gap-3">
                <LabelledInput label={m["common.region"]()} value={region} onChange={(e) => setRegion(e.target.value)} />
                <LabelledInput label={m["common.district"]()} value={district} onChange={(e) => setDistrict(e.target.value)} />
                <LabelledInput label={m["onboarding.division"]()} value={division} onChange={(e) => setDivision(e.target.value)} />
              </div>
            </>
          ),
        },
      ]}
    />
  )
}

function CommandSetup({ installation, onBack, onDone }: { installation: Installation; onBack: () => void; onDone: () => void }) {
  const [commandName, setCommandName] = useState('')
  const [level, setLevel] = useState<string>('district')
  const [administrator, setAdministrator] = useState<Administrator>(emptyAdministrator)

  return (
    <SetupWizard
      mode="command"
      installation={installation}
      administrator={administrator}
      setAdministrator={setAdministrator}
      withPassword
      validate={() => (commandName.trim() ? null : m["onboarding.err_command_name"]())}
      submit={() => setupCommand({ commandName, level, administrator })}
      submitLabel={m["onboarding.submit_command"]()}
      onBack={onBack}
      onDone={onDone}
      steps={[
        {
          id: 'command',
          icon: NetworkIcon,
          title: m["onboarding.name_command"](),
          description: m["onboarding.name_command_desc"](),
          body: (
            <>
              <LabelledInput label={m["onboarding.command_name"]()} autoFocus placeholder={m["onboarding.command_placeholder"]()} value={commandName} onChange={(e) => setCommandName(e.target.value)} />
              <Field>
                <FieldLabel>{m["onboarding.level"]()}</FieldLabel>
                <Select items={[...commandLevels]} value={level} onValueChange={(v) => setLevel(String(v))}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {commandLevels.map((l) => (
                      <SelectItem key={l.value} value={l.value}>
                        {l.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FieldDescription>{m["onboarding.level_hint"]()}</FieldDescription>
              </Field>
            </>
          ),
        },
      ]}
    />
  )
}
