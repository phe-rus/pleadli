import * as m from '@/paraglide/messages'
import { SettingsCard } from '@/components/settings-card'
import { useListener } from './queries'

/** Where stations reach this command. A station types this address into its own
 * Settings, with the number this command gave it. */
export function ListenerCard() {
  const { data: listener } = useListener()
  const address = listener?.address ? `${listener.address}:${listener.port}` : null
  return (
    <SettingsCard
      title={m["command.listener_title"]()}
      description={m["command.listener_description"]()}
      hint={m["command.listener_hint"]()}
    >
      {address ? <p className="rounded-md bg-secondary px-4 py-3 font-mono text-lg">{address}</p> : <p className="text-muted-foreground">{m["command.listener_no_address"]()}</p>}
    </SettingsCard>
  )
}
