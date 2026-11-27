import * as m from '@/paraglide/messages'
import { PlaceTabs } from '@/components/place-tabs'
import { useBonds } from '@/features/bonds'
import { useCustodyRecords } from '@/features/custody'

/** Cells: who is in custody now, and who is out on a police bond. The counts are the live figures, not every record ever made. */
export function CellsTabs({ active }: { active: 'custody' | 'bonds' }) {
  const { data: records } = useCustodyRecords('')
  const { data: bonds } = useBonds('')
  return (
    <PlaceTabs
      label={m["nav_sections.cells"]()}
      active={active}
      tabs={[
        { id: 'custody', to: '/search/custody', label: m["nav.in_custody"](), count: records.filter((r) => r.status === 'in_custody').length },
        { id: 'bonds', to: '/search/bonds', label: m["nav.bonds_and_sureties"](), count: bonds.filter((b) => b.status === 'active').length },
      ]}
    />
  )
}
