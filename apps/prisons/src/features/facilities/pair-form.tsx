import { ApiError } from '@/lib/api'
import { useAppForm } from '@pleadli/forms-tables/forms'
import { Field, FieldLabel } from '@pleadli/ui/field'
import { t } from '@pleadli/ui/goey-toaster'
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@pleadli/ui/select'
import { usePairWithHeadOfficeLater } from './queries'
import { facilityRegions, parsePairingCode, type RegisterFacilityInput } from './schema'

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
        t.error('That does not look like a Pleadli pairing code')
        return
      }
      const { pairingCode, ...input } = value
      try {
        await pair.mutateAsync({ pairingCode: pairingCode.trim(), input })
        t.success('Paired with Head Office')
        onPaired?.()
      } catch (error) {
        t.error('Could not pair', { description: error instanceof ApiError ? error.message : 'Please try again.' })
      }
    },
  })

  return (
    <form
      className="flex flex-col gap-4 md:max-w-lg"
      onSubmit={(event) => {
        event.preventDefault()
        form.handleSubmit()
      }}
    >
      <form.AppField name="pairingCode">{(f) => <f.input label="Pairing code" placeholder="Paste the code Head Office gave you" />}</form.AppField>
      <form.AppField name="name">{(f) => <f.input label="Facility name" />}</form.AppField>
      <div className="grid grid-cols-2 gap-3">
        <form.AppField name="facilityNumber">{(f) => <f.input label="Facility ID or number" />}</form.AppField>
        <form.AppField name="location">{(f) => <f.input label="Location" />}</form.AppField>
      </div>
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
        <form.submit label={pair.isPending ? 'Pairing…' : 'Pair with Head Office'} />
      </form.AppForm>
    </form>
  )
}
