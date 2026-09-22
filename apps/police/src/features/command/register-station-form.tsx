import { useReportDirty } from '@/hooks/use-report-dirty'
import { useAppForm } from '@pleadli/forms-tables/forms'
import { DrawerFooter } from '@pleadli/ui/drawer'
import { FieldDescription, FieldGroup } from '@pleadli/ui/field'
import { t } from '@pleadli/ui/goey-toaster'
import { useRegisterStation } from './queries'

/** Adds a station to this command. It is given a station number; the station
 * connects with that number, and an activation code if one is issued. */
export function RegisterStationForm({ onSuccess, onDirtyChange }: { onSuccess?: () => void; onDirtyChange?: (dirty: boolean) => void }) {
  const register = useRegisterStation()
  const form = useAppForm({
    defaultValues: { name: '', region: '', district: '' },
    onSubmit: async ({ value }) => {
      try {
        const station = await register.mutateAsync(value)
        t.success(`${station.name} is registered as ${station.stationNumber}`)
        onSuccess?.()
      } catch (error) {
        t.error('Could not register the station', { description: error instanceof Error ? error.message : 'Please try again.' })
      }
    },
  })
  useReportDirty(form, onDirtyChange)

  return (
    <form
      className="flex flex-1 flex-col gap-4 overflow-y-auto p-4"
      onSubmit={(event) => {
        event.preventDefault()
        form.handleSubmit()
      }}
    >
      <FieldGroup>
        <form.AppField name="name">{(f) => <f.input label="Station name" placeholder="e.g. Wandegeya Police Station" />}</form.AppField>
        <div className="grid grid-cols-2 gap-3">
          <form.AppField name="region">{(f) => <f.input label="Region" />}</form.AppField>
          <form.AppField name="district">{(f) => <f.input label="District" />}</form.AppField>
        </div>
        <FieldDescription>The station is given a number here. It connects from its own Settings using that number.</FieldDescription>
      </FieldGroup>
      <DrawerFooter>
        <form.AppForm>
          <form.submit label="Register station" />
        </form.AppForm>
      </DrawerFooter>
    </form>
  )
}
