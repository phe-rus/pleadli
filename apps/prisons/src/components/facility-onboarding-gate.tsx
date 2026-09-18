import { PreAuthLayout, ScreenHeader, screenTransition } from '@/components/pre-auth-layout'
import { OfficerForm, useIsBootstrap } from '@/features/officers'
import { facilityRegions, useOwnFacility, useRegisterFacilitySelf, type RegisterFacilityInput } from '@/features/facilities'
import { useHqConfig } from '@/features/session'
import { useAppForm } from '@pleadli/forms-tables/forms'
import { Field, FieldLabel } from '@pleadli/ui/field'
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@pleadli/ui/select'
import { t } from '@pleadli/ui/goey-toaster'
import { PrisonIcon, UserAdd01Icon } from '@hugeicons/core-free-icons'
import { AnimatePresence, motion } from 'framer-motion'
import type { ReactNode } from 'react'

/**
 * First-launch onboarding for a facility installation, as two real steps
 * (spec direction: register the facility, then create the first officer,
 * only after that landing in the app — usable immediately even before
 * Head Office approves it, since a facility never blocks on that). Sits
 * beside `HqOnboardingGate`/`HqSignInGate` in `__root.tsx`: passes
 * straight through for a Head Office installation or once both steps are
 * done, and re-derives which step to show from real state each render
 * rather than a stored "onboarding complete" flag, so it self-heals if
 * either step's data is ever missing.
 */
export function FacilityOnboardingGate({ children }: { children: ReactNode }) {
  const { data: hqConfig, isLoading: configLoading } = useHqConfig()
  const isFacility = hqConfig != null && !hqConfig.isHeadOffice

  const { data: ownFacility, isLoading: facilityLoading } = useOwnFacility(isFacility)
  const { data: isBootstrap, isLoading: bootstrapLoading } = useIsBootstrap()

  if (!isFacility) return <>{children}</>
  if (configLoading || facilityLoading || bootstrapLoading) return null
  if (ownFacility == null) return <FacilityDetailsScreen />
  if (isBootstrap) return <FirstOfficerScreen />
  return <>{children}</>
}

function FacilityDetailsScreen() {
  const registerFacility = useRegisterFacilitySelf()

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
        await registerFacility.mutateAsync(value)
      } catch {
        t.error('Could not register this facility', { description: 'Check the details and try again.' })
      }
    },
  })

  return (
    <PreAuthLayout>
      <AnimatePresence mode="wait" initial={false}>
        <motion.div key="facility-details" {...screenTransition} className="flex w-full max-w-sm flex-col gap-6">
          <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <span className="flex size-5 items-center justify-center rounded-full bg-primary/15 text-primary">1</span>
            Step 1 of 2
          </div>
          <ScreenHeader
            icon={PrisonIcon}
            title="Register this facility"
            description="Head Office will see this once it's reachable. You can start using the system before that's approved."
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
                <form.submit label="Continue" />
              </div>
            </form.AppForm>
          </form>
        </motion.div>
      </AnimatePresence>
    </PreAuthLayout>
  )
}

function FirstOfficerScreen() {
  return (
    <PreAuthLayout>
      <AnimatePresence mode="wait" initial={false}>
        <motion.div key="first-officer" {...screenTransition} className="flex w-full max-w-sm flex-col gap-6">
          <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <span className="flex size-5 items-center justify-center rounded-full bg-primary/15 text-primary">2</span>
            Step 2 of 2
          </div>
          <ScreenHeader
            icon={UserAdd01Icon}
            title="Create the first officer account"
            description="This account becomes the administrator for this facility and can add every other officer afterward."
          />
          <div className="rounded-lg border border-border bg-card p-4 shadow-xs">
            <OfficerForm isBootstrap />
          </div>
        </motion.div>
      </AnimatePresence>
    </PreAuthLayout>
  )
}
