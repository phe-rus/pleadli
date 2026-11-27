import * as m from '@/paraglide/messages'
import { PlaceTabs } from '@/components/place-tabs'
import { usePeopleSearch } from '@/features/people'
import { useVehicles } from '@/features/vehicles'

/** People, with vehicles beside: who the station knows and what they drive. */
export function PeopleTabs({ active }: { active: 'people' | 'vehicles' }) {
  const { data: people } = usePeopleSearch('')
  const { data: vehicles } = useVehicles('')
  return (
    <PlaceTabs
      label={m["nav.people"]()}
      active={active}
      tabs={[
        { id: 'people', to: '/search/people', label: m["nav.people"](), count: people.length },
        { id: 'vehicles', to: '/vehicles', label: m["nav.vehicles"](), count: vehicles.length },
      ]}
    />
  )
}
