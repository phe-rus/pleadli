import * as m from '@/paraglide/messages'
import { PlaceTabs } from '@/components/place-tabs'
import { useInstallation } from '@/features/session'

export type StationTab = 'officers' | 'roster' | 'armory' | 'impounded' | 'statistics' | 'exchange'

/** Whether this installation is a station. A Command shares some of these pages (Officers) but has its own sidebar and no station tabs. */
function useIsStation() {
  return useInstallation().data?.mode === 'station'
}

/** The title of a page that belongs to the Station place: "Station" in a station, its own name elsewhere. */
export function useStationTitle(own: string) {
  return useIsStation() ? m["nav_sections.station"]() : own
}

/** The station's own business: its officers, roster, stores, figures and the line to the DPP. One place, six tabs. */
export function StationTabs({ active }: { active: StationTab }) {
  const station = useIsStation()
  if (!station) return null
  return (
    <PlaceTabs
      label={m["nav_sections.station"]()}
      active={active}
      tabs={[
        { id: 'officers', to: '/station/officers', label: m["common.officers"]() },
        { id: 'roster', to: '/roster', label: m["nav.duty_roster"]() },
        { id: 'armory', to: '/stores/armory', label: m["nav.armory"]() },
        { id: 'impounded', to: '/stores/impounded', label: m["nav.impounded_assets"]() },
        { id: 'statistics', to: '/reports', label: m["nav.statistics"]() },
        { id: 'exchange', to: '/exchange', label: m["nav.exchange"]() },
      ]}
    />
  )
}
