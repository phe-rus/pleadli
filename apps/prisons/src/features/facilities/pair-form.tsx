import { ApiError } from '@/lib/api'
import { useAppForm } from '@pleadli/forms-tables/forms'
import { Field, FieldLabel } from '@pleadli/ui/field'
import { t } from '@pleadli/ui/goey-toaster'
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@pleadli/ui/select'
import { usePairWithHeadOfficeLater } from './queries'
import { facilityRegions, parsePairingCode, type RegisterFacilityInput } from './schema'
import { m } from '@/paraglide/messages'

/** Pairs a facility that started on its own with a Head Office, from
 * settings. The same details as first-launch pairing; the node makes the
 * outbound call and stores the credentials. Needs `node.manage`. */
export function PairWithHeadOfficeForm({ onPaired }: { onPaired?: () => void }) {
  const pair = usePairWithHeadOfficeLater()

  const form = useAppForm({
    defaultValues: {
      pairingCode: '',
      name: '',
      facilityNumber: '',
      location: '',
      region: '' as RegisterFacilityInput['region'],
      headOfficerName: '',
    },
    onSubmit: async ({ value }) => {
      try {
        parsePairingCode(value.pairingCode.trim())
      } catch {
        t.error(m.facilities_that_does_not_look_like_a())
        return
      }
      const { pairingCode, ...input } = value
      try {
        await pair.mutateAsync({ pairingCode: pairingCode.trim(), input })
        t.success(m.facilities_paired_with_head_office())
        onPaired?.()
      } catch (error) {
        t.error(m.facilities_could_not_pair(), { description: error instanceof ApiError ? error.message : m.facilities_please_try_again() })
      }
    },
  })

  return (
    <form
      className="flex flex-col gap-4 md:max-w-xl"
      onSubmit={(event) => {
        event.preventDefault()
        form.handleSubmit()
      }}
    >
      <form.AppField name="pairingCode">{(f) => <f.input label={m.facilities_pairing_code()} autoComplete="off" placeholder={m.facilities_paste_the_code_head_office_gave()} />}</form.AppField>
      <form.AppField name="name">{(f) => <f.input label={m.facilities_facility_name()} autoComplete="organization" />}</form.AppField>
      <div className="grid grid-cols-2 gap-3">
        <form.AppField name="facilityNumber">{(f) => <f.input label={m.facilities_facility_id_or_number()} autoComplete="off" />}</form.AppField>
        <form.AppField name="location">{(f) => <f.input label={m.facilities_location()} autoComplete="address-level2" />}</form.AppField>
      </div>
      <form.AppField name="region">
        {(f) => (
          <Field>
            <FieldLabel>{m.facilities_region()}</FieldLabel>
            <Select value={f.state.value} onValueChange={(value) => f.handleChange((value as never) ?? f.state.value)}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder={m.facilities_select_region()} />
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
      <form.AppField name="headOfficerName">{(f) => <f.input label={m.facilities_head_officer_s_name()} autoComplete="name" />}</form.AppField>
      <form.AppForm>
        <form.submit label={pair.isPending ? m.facilities_pairing() : m.facilities_pair_with_head_office()} />
      </form.AppForm>
    </form>
  )
}
