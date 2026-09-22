import { CommandOverview } from '@/features/command'
import { useInstallation } from '@/features/session'
import { OverviewPage } from './overview-page'

/** A station shows its own work; a command shows what its stations reported. */
export function OverviewSwitch() {
  const { data: installation } = useInstallation()
  return installation?.mode === 'command' ? <CommandOverview /> : <OverviewPage />
}
