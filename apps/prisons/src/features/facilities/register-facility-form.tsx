import { ApiError } from '@/lib/api'
import { useAppForm } from '@pleadli/forms-tables/forms'
import { DrawerFooter } from '@pleadli/ui/drawer'
import { t } from '@pleadli/ui/goey-toaster'
import { useCreateFacility } from './queries'
import { facilityRegions, registerFacilityInputSchema, type Facility, type RegisterFacilityInput } from './schema'

const regionOptions = facilityRegions.map((region) => ({ value: region, label: region }))

/** Head Office adds a facility to its roster before the facility connects.
 * The facility then finds it by number; the activation code issued here lets
 * it connect without waiting for approval. */
export function RegisterFacilityForm({ onSuccess }: { onSuccess?: (facility: Facility) => void }) {
  const create = useCreateFacility()

  const form = useAppForm({
    defaultValues: { name: '', facilityNumber: '', location: '', region: '', headOfficerName: '' },
    validators: {
      onSubmit: ({ value }) => {
        const parsed = registerFacilityInputSchema.safeParse(value)
        return parsed.success ? undefined : parsed.error.issues[0]?.message
      },
    },
    onSubmit: async ({ value, formApi }) => {
      try {
        const facility = await create.mutateAsync(value as RegisterFacilityInput)
        t.success(`${facility.name} added to the roster`, {
          description: facility.verificationCodePlaintext ? `Activation code ${facility.verificationCodePlaintext}` : undefined,
        })
        formApi.reset()
        onSuccess?.(facility)
      } catch (error) {
        t.error('Could not add the facility', { description: error instanceof ApiError ? error.message : 'Please try again.' })
      }
    },
  })

  return (
    <form
      className="flex flex-1 flex-col gap-4 overflow-y-auto p-4"
      onSubmit={(event) => {
        event.preventDefault()
        form.handleSubmit()
      }}
    >
      <form.AppField name="name">{(f) => <f.input label="Facility name" autoComplete="organization" autoFocus />}</form.AppField>
      <div className="grid gap-3 sm:grid-cols-2">
        <form.AppField name="facilityNumber">{(f) => <f.input label="Facility ID or number" autoComplete="off" />}</form.AppField>
        <form.AppField name="region">{(f) => <f.select label="Region" options={regionOptions} placeholder="Select region" />}</form.AppField>
      </div>
      <form.AppField name="location">{(f) => <f.input label="Location" autoComplete="address-level2" />}</form.AppField>
      <form.AppField name="headOfficerName">{(f) => <f.input label="Head officer's name" autoComplete="name" />}</form.AppField>
      <DrawerFooter>
        <form.AppForm>
          <form.submit label={create.isPending ? 'Adding…' : 'Add to roster'} />
        </form.AppForm>
      </DrawerFooter>
    </form>
  )
}
