import { useReportDirty } from '@/hooks/use-report-dirty'
import { useAppForm } from '@pleadli/forms-tables/forms'
import { DrawerFooter } from '@pleadli/ui/drawer'
import { FieldGroup } from '@pleadli/ui/field'
import { t } from '@pleadli/ui/goey-toaster'
import { useSaveStationProfile, useStationProfile } from './queries'

export type StationProfileFormProps = {
  onSuccess?: () => void
  onDirtyChange?: (dirty: boolean) => void
}

/** The station's own identity, edited in a drawer like every other record
 * in the app; the route itself shows it read-only. */
export function StationProfileForm({ onSuccess, onDirtyChange }: StationProfileFormProps) {
  const { data: profile } = useStationProfile()
  const saveProfile = useSaveStationProfile()

  const form = useAppForm({
    defaultValues: {
      name: profile?.name ?? '',
      address: profile?.address ?? '',
      jurisdiction: profile?.jurisdiction ?? '',
      contact: profile?.contact ?? '',
      ocStationName: profile?.ocStationName ?? '',
      ocStationRank: profile?.ocStationRank ?? '',
    },
    onSubmit: async ({ value }) => {
      try {
        await saveProfile.mutateAsync(value)
        t.success('Station profile saved')
        onSuccess?.()
      } catch {
        t.error('Could not save station profile', { description: 'Please try again.' })
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
        <div className="grid grid-cols-2 gap-3">
          <form.AppField name="name">{(f) => <f.input label="Station name" />}</form.AppField>
          <form.AppField name="jurisdiction">
            {(f) => <f.input label="Jurisdiction" placeholder="e.g. Kampala Central Division" />}
          </form.AppField>
        </div>

        <form.AppField name="address">{(f) => <f.input label="Address" />}</form.AppField>

        <form.AppField name="contact">
          {(f) => <f.input label="Contact / telephone" />}
        </form.AppField>

        <div className="grid grid-cols-2 gap-3">
          <form.AppField name="ocStationName">{(f) => <f.input label="OC Station name" />}</form.AppField>
          <form.AppField name="ocStationRank">{(f) => <f.input label="OC Station rank" />}</form.AppField>
        </div>
      </FieldGroup>

      <DrawerFooter>
        <form.AppForm>
          <form.submit label="Save station profile" />
        </form.AppForm>
      </DrawerFooter>
    </form>
  )
}
