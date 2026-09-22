import { SettingsCard } from '@/components/settings-card'
import { useListener } from './queries'

/** Where stations reach this command. A station types this address into its own
 * Settings, with the number this command gave it. */
export function ListenerCard() {
  const { data: listener } = useListener()
  const address = listener?.address ? `${listener.address}:${listener.port}` : null
  return (
    <SettingsCard
      title="Where stations connect"
      description="A station enters this address, and the station number from the Stations page, in its own Settings."
      hint="The connection is not encrypted yet. Use it on a network this command controls."
    >
      {address ? <p className="rounded-md bg-secondary px-4 py-3 font-mono text-lg">{address}</p> : <p className="text-muted-foreground">This computer has no network address. Connect it to the network first.</p>}
    </SettingsCard>
  )
}
