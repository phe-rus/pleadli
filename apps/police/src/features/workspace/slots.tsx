import * as m from '@/paraglide/messages'
import { ActivityToasts } from '@/features/activity'
import { CustodyAttentionDialog } from '@/features/custody'
import { BackupDispatchIndicator } from '@/features/officers'
import { LicenceBar } from '@/features/orchestra'
import { DevModeSwitch, useInstallation } from '@/features/session'
import { useStationCounts } from './station-counts'

export { LicenceBar }

/** A station's own alerts, live only while there is something to say; a command
 * holds none of these records. */
export function HeaderEnd() {
  const station = useInstallation().data?.mode === 'station'
  return (
    <>
      {station && (
        <>
          <BackupDispatchIndicator />
          <CustodyAttentionDialog />
          <ActivityToasts />
        </>
      )}
      {import.meta.env.DEV && <DevModeSwitch compact />}
    </>
  )
}

/** The foot of the window: who is in the cells, and how many are near the limit. */
export function StatusBar() {
  const counts = useStationCounts()
  if (!counts) return null
  return (
    <>
      <span>{counts.inCells === 1 ? m["workspace.custody_one"]() : m["workspace.custody_n"]({ count: counts.inCells })}</span>
      {counts.custodyDue > 0 && <span className="text-destructive">{m["workspace.near_limit"]({ count: counts.custodyDue })}</span>}
    </>
  )
}
