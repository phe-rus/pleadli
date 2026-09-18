import { PreAuthLayout, ScreenHeader, screenTransition } from '@/components/pre-auth-layout'
import {
  facilityRegions,
  parsePairingCode,
  usePairWithHeadOffice,
  type RegisterFacilityInput,
} from '@/features/facilities'
import { ApiError } from '@/lib/api'
import { useHqConfig } from '@/features/session'
import { useAppForm } from '@pleadli/forms-tables/forms'
import { Field, FieldLabel } from '@pleadli/ui/field'
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@pleadli/ui/select'
import { t } from '@pleadli/ui/goey-toaster'
import { Key01Icon, PrisonIcon } from '@hugeicons/core-free-icons'
import { AnimatePresence, motion } from 'framer-motion'
import { useState, type ReactNode } from 'react'
import { Button } from '@pleadli/ui/button'

type PendingPairing = { pairingCode: string; hostname: string }

/**
 * First-launch pairing for a facility installation, in two steps: paste the
 * one pairing code Head Office handed over (it carries Head Office's own
 * hostname), then fill in the facility's details. The node makes the outbound
 * call to Head Office and stores the credentials; the webview never talks to
 * Head Office itself.
 *
 * Pairing is optional. A facility works completely on its own, so the first
 * screen offers "Continue without Head Office". Pairing can be done later
 * from the facility's connectivity settings. This gate only appears while the
 * installation has no accounts yet (the persisted first-launch state), so it
 * never returns once the first account exists.
 */
export function FacilityOnboardingGate({ children }: { children: ReactNode }) {
  const { data: state, isLoading } = useHqConfig()
  const [skipped, setSkipped] = useState(false)

  if (isLoading || !state) return null
  const needsPairingChoice = state.role === 'facility' && !state.paired && state.bootstrap && !skipped
  if (needsPairingChoice) return <FacilityPairingFlow onSkip={() => setSkipped(true)} />
  return <>{children}</>
}

function FacilityPairingFlow({ onSkip }: { onSkip: () => void }) {
  const [pending, setPending] = useState<PendingPairing | null>(null)

  return pending ? (
    <FacilityDetailsScreen pending={pending} onBack={() => setPending(null)} />
  ) : (
    <PairingCodeScreen onEntered={setPending} onSkip={onSkip} />
  )
}

function PairingCodeScreen({ onEntered, onSkip }: { onEntered: (pending: PendingPairing) => void; onSkip: () => void }) {
  const [raw, setRaw] = useState('')

  return (
    <PreAuthLayout>
      <AnimatePresence mode="wait" initial={false}>
        <motion.div key="pairing-code" {...screenTransition} className="flex w-full max-w-sm flex-col gap-6">
          <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <span className="flex size-5 items-center justify-center rounded-full bg-primary/15 text-primary">1</span>
            Step 1 of 2
          </div>
          <ScreenHeader
            icon={Key01Icon}
            title="Pair with your Head Office"
            description="Paste the pairing code your Head Office gave you. It carries everything needed to reach it, so you never type a hostname. This facility works fully offline whether or not you pair."
          />
          <form
            className="flex flex-col gap-4 rounded-lg border border-border bg-card p-4 shadow-xs"
            onSubmit={(event) => {
              event.preventDefault()
              try {
                const { hostname } = parsePairingCode(raw.trim())
                onEntered({ pairingCode: raw.trim(), hostname })
              } catch {
                t.error('That does not look like a Pleadli pairing code')
              }
            }}
          >
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-medium">Pairing code</span>
              <input
                autoFocus
                value={raw}
                onChange={(event) => setRaw(event.target.value)}
                placeholder="e.g. https://hq.example.com#8f2..."
                className="h-9 w-full rounded-md border border-border bg-background px-2.5 font-mono text-xs outline-none focus:border-primary"
              />
            </label>
            <Button type="submit" disabled={raw.trim().length === 0} className="w-full">
              Continue
            </Button>
            <Button type="button" variant="secondary" className="w-full" onClick={onSkip}>
              Continue without Head Office
            </Button>
          </form>
        </motion.div>
      </AnimatePresence>
    </PreAuthLayout>
  )
}

function FacilityDetailsScreen({ pending, onBack }: { pending: PendingPairing; onBack: () => void }) {
  const pairWithHeadOffice = usePairWithHeadOffice()

  const form = useAppForm({
    defaultValues: {
      name: '',
      facilityNumber: '',
      location: '',
      region: '' as RegisterFacilityInput['region'],
      headOfficerName: '',
    } as RegisterFacilityInput,
    onSubmit: async ({ value }) => {
      try {
        await pairWithHeadOffice.mutateAsync({ pairingCode: pending.pairingCode, input: value })
      } catch (error) {
        t.error('Head Office could not register this facility', {
          description:
            error instanceof ApiError
              ? error.message
              : 'The pairing code may have already been used or expired. Ask for a new one.',
        })
      }
    },
  })

  const hostname = pending.hostname

  return (
    <PreAuthLayout>
      <AnimatePresence mode="wait" initial={false}>
        <motion.div key="facility-details" {...screenTransition} className="flex w-full max-w-sm flex-col gap-6">
          <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <span className="flex size-5 items-center justify-center rounded-full bg-primary/15 text-primary">2</span>
            Step 2 of 2
          </div>
          <ScreenHeader
            icon={PrisonIcon}
            title="Register this facility"
            description={`These details go straight to your Head Office at ${hostname}. You can start using the system before it approves the pairing.`}
          />
          <form
            className="flex flex-col gap-4 rounded-lg border border-border bg-card p-4 shadow-xs"
            onSubmit={(event) => {
              event.preventDefault()
              form.handleSubmit()
            }}
          >
            <form.AppField name="name">{(f) => <f.input label="Facility name" autoFocus />}</form.AppField>
            <form.AppField name="facilityNumber">{(f) => <f.input label="Facility ID or number" />}</form.AppField>
            <form.AppField name="location">{(f) => <f.input label="Location" />}</form.AppField>
            <form.AppField name="region">
              {(f) => (
                <Field>
                  <FieldLabel>Region</FieldLabel>
                  <Select value={f.state.value} onValueChange={(value) => f.handleChange((value as never) ?? f.state.value)}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select region" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {facilityRegions.map((region) => (
                          <SelectItem key={region} value={region}>
                            {region}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </Field>
              )}
            </form.AppField>
            <form.AppField name="headOfficerName">{(f) => <f.input label="Head officer's name" />}</form.AppField>
            <form.AppForm>
              <div className="*:w-full">
                <form.submit label={pairWithHeadOffice.isPending ? 'Pairing…' : 'Confirm'} />
              </div>
            </form.AppForm>
            <Button type="button" variant="ghost" className="w-full" onClick={onBack} disabled={pairWithHeadOffice.isPending}>
              Back
            </Button>
          </form>
        </motion.div>
      </AnimatePresence>
    </PreAuthLayout>
  )
}
