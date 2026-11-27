import * as m from '@/paraglide/messages'
import { PlaceTabs } from '@/components/place-tabs'
import { useIncidents } from '@/features/incidents'
import { useStationDiaryEntries } from '@/features/station-diary'

/** The front desk: what the station logged as it happened (the diary) and what it recorded as an incident. */
export function FrontDeskTabs({ active }: { active: 'diary' | 'incidents' }) {
  const { data: entries } = useStationDiaryEntries('')
  const { data: incidents } = useIncidents('')
  return (
    <PlaceTabs
      label={m["nav.front_desk"]()}
      active={active}
      tabs={[
        { id: 'diary', to: '/sd-log', label: m["nav.station_diary"](), count: entries.length },
        { id: 'incidents', to: '/incidents', label: m["nav.incidents"](), count: incidents.length },
      ]}
    />
  )
}
