import { ApiError } from '@/lib/api'
import { useAppForm } from '@pleadli/forms-tables/forms'
import { DrawerFooter } from '@pleadli/ui/drawer'
import { t } from '@pleadli/ui/goey-toaster'
import { useCreateFacility } from './queries'
import { facilityRegions, registerFacilityInputSchema, type Facility, type RegisterFacilityInput } from './schema'
import { m } from '@/paraglide/messages'

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
        t.success(m.facilities_added_to_the_roster({ name: facility.name }), {
          description: facility.verificationCodePlaintext ? m.facilities_activation_code({ verificationCodePlaintext: facility.verificationCodePlaintext }) : undefined,
        })
        formApi.reset()
        onSuccess?.(facility)
      } catch (error) {
        t.error(m.facilities_could_not_add_the_facility(), { description: error instanceof ApiError ? error.message : m.facilities_please_try_again() })
      }
    },
  })

  return (
    <form
      className="panel-body"
      onSubmit={(event) => {
        event.preventDefault()
        form.handleSubmit()
      }}
    >
      <form.AppField name="name">{(f) => <f.input label={m.facilities_facility_name()} autoComplete="organization" autoFocus />}</form.AppField>
      <div className="grid gap-3 sm:grid-cols-2">
        <form.AppField name="facilityNumber">{(f) => <f.input label={m.facilities_facility_id_or_number()} autoComplete="off" />}</form.AppField>
        <form.AppField name="region">{(f) => <f.select label={m.facilities_region()} options={regionOptions} placeholder={m.facilities_select_region()} />}</form.AppField>
      </div>
      <form.AppField name="location">{(f) => <f.input label={m.facilities_location()} autoComplete="address-level2" />}</form.AppField>
      <form.AppField name="headOfficerName">{(f) => <f.input label={m.facilities_head_officer_s_name()} autoComplete="name" />}</form.AppField>
      <DrawerFooter>
        <form.AppForm>
          <form.submit label={create.isPending ? m.facilities_adding() : m.facilities_add_to_roster()} />
        </form.AppForm>
      </DrawerFooter>
    </form>
  )
}
