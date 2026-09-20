import { SelectField, TextField } from '@/components/form-fields'
import { SettingsCard } from '@/components/settings-card'
import { ugRegions } from '@/features/jurisdiction'
import { ApiError } from '@/lib/api'
import { Button } from '@pleadli/ui/button'
import { DrawerFooter } from '@pleadli/ui/drawer'
import { t } from '@pleadli/ui/goey-toaster'
import { m } from '@/paraglide/messages'
import { useState } from 'react'
import { useSaveFacilityProfile } from './queries'
import type { FacilityProfile } from './schema'

const regions = ugRegions.map((r) => ({ value: r, label: r }))

type FacilityProfileFormProps = {
  profile: FacilityProfile
  /** In a drawer (the default) the form fills it and pins its button to the
   * foot. Inline, in a Settings section, it takes only the room it needs. */
  inline?: boolean
  /** Head Office's own identity: an organisation, with no region and no places. */
  organisation?: boolean
  onSuccess?: () => void
  onDirtyChange?: (dirty: boolean) => void
}

/** The facility's own name and approved capacity: what a transfer dossier
 * says about who sent someone, and what occupancy is measured against. */
export function FacilityProfileForm({ profile, inline = false, organisation = false, onSuccess, onDirtyChange }: FacilityProfileFormProps) {
  const save = useSaveFacilityProfile()
  const [name, setName] = useState(profile.name ?? '')
  const [number, setNumber] = useState(profile.facilityNumber ?? '')
  const [location, setLocation] = useState(profile.location ?? '')
  const [region, setRegion] = useState(profile.region ?? '')
  const [capacity, setCapacity] = useState(profile.approvedCapacity != null ? String(profile.approvedCapacity) : '')

  const change = (setter: (value: string) => void) => (value: string) => {
    onDirtyChange?.(true)
    setter(value)
  }

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    try {
      await save.mutateAsync({ name, facilityNumber: number, location, region, approvedCapacity: capacity })
      t.success(m.facility_facility_profile_saved())
      onSuccess?.()
    } catch (error) {
      t.error(m.facility_could_not_save_the_profile(), { description: error instanceof ApiError ? error.message : m.facility_check_the_details_and_try_again() })
    }
  }

  const fields = (
    <>
      <TextField label={organisation ? m.settings_org_name() : m.facility_facility_name()} value={name} onChange={change(setName)} autoFocus={!inline} />
      <TextField label={organisation ? m.settings_org_code() : m.facility_facility_id_or_number()} value={number} onChange={change(setNumber)} />
      <TextField label={m.facility_location()} value={location} onChange={change(setLocation)} />
      {!organisation && (
        <>
          <SelectField label={m.facility_region()} value={region} onChange={change(setRegion)} options={regions} placeholder={m.facility_choose_the_region()} />
          <TextField
            label={m.facility_approved_capacity()}
            type="number"
            value={capacity}
            onChange={change(setCapacity)}
            description={m.facility_the_number_of_places_the_facility()}
          />
        </>
      )}
    </>
  )

  if (inline) {
    return (
      <SettingsCard
        onSubmit={submit}
        hint={m.settings_profile_hint()}
        action={
          <Button type="submit" size="sm" disabled={!name.trim() || save.isPending}>
            {m.settings_save_profile()}
          </Button>
        }
      >
        {fields}
      </SettingsCard>
    )
  }

  return (
    <form className="panel-body" onSubmit={submit}>
      {fields}
      <DrawerFooter>
        <Button type="submit" disabled={!name.trim() || save.isPending}>
          {m.settings_save_profile()}
        </Button>
      </DrawerFooter>
    </form>
  )
}
