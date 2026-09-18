import { SelectField, TextField } from '@/components/form-fields'
import { ApiError } from '@/lib/api'
import { Button } from '@pleadli/ui/button'
import { DrawerFooter } from '@pleadli/ui/drawer'
import { t } from '@pleadli/ui/goey-toaster'
import { useState } from 'react'
import { useSaveFacilityProfile } from './queries'
import type { FacilityProfile } from './schema'

const regions = [
  'Southern', 'Northern', 'Kigezi', 'Mid Central', 'Central', 'Kampala Extra', 'Eastern', 'North Central', 'Mid Western',
  'Mid Northern', 'Mid Eastern', 'South Western', 'East Central', 'North Eastern', 'Iganga', 'Western', 'North Western', 'Kooki',
  'South Eastern',
].map((r) => ({ value: r, label: r }))

type FacilityProfileFormProps = {
  profile: FacilityProfile
  onSuccess?: () => void
  onDirtyChange?: (dirty: boolean) => void
}

/** The facility's own name and approved capacity: what a transfer dossier
 * says about who sent someone, and what occupancy is measured against. */
export function FacilityProfileForm({ profile, onSuccess, onDirtyChange }: FacilityProfileFormProps) {
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

  return (
    <form
      className="flex flex-1 flex-col gap-4 overflow-y-auto p-4"
      onSubmit={async (event) => {
        event.preventDefault()
        try {
          await save.mutateAsync({ name, facilityNumber: number, location, region, approvedCapacity: capacity })
          t.success('Facility profile saved')
          onSuccess?.()
        } catch (error) {
          t.error('Could not save the profile', { description: error instanceof ApiError ? error.message : 'Check the details and try again.' })
        }
      }}
    >
      <TextField label="Facility name" value={name} onChange={change(setName)} autoFocus />
      <TextField label="Facility ID or number" value={number} onChange={change(setNumber)} />
      <TextField label="Location" value={location} onChange={change(setLocation)} />
      <SelectField label="Region" value={region} onChange={change(setRegion)} options={regions} placeholder="Choose the region" />
      <TextField
        label="Approved capacity"
        type="number"
        value={capacity}
        onChange={change(setCapacity)}
        description="The number of places the facility is approved for. Occupancy is measured against it."
      />
      <DrawerFooter>
        <Button type="submit" disabled={!name.trim() || save.isPending}>
          Save profile
        </Button>
      </DrawerFooter>
    </form>
  )
}
