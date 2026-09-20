import { ConnectFlow } from '@/features/facilities'
import { useSession } from '@/features/session'
import { m } from '@/paraglide/messages'
import { Button } from '@pleadli/ui/button'
import { t } from '@pleadli/ui/goey-toaster'
import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'

/** The last step, after the facility already exists and is signed in. The
 * facility is complete without Head Office, so this is an offer, not a
 * requirement, and skipping it costs nothing. */
export function HeadOfficeStep({ onDone }: { onDone: () => void }) {
  const [connecting, setConnecting] = useState(false)
  const { data: session } = useSession()
  const queryClient = useQueryClient()
  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['systemState'] })
    queryClient.invalidateQueries({ queryKey: ['peerSyncConfig'] })
  }

  if (connecting && session) {
    return (
      <div className="rounded-lg border border-border bg-card p-4 shadow-xs">
        <ConnectFlow
          scope="network"
          requester={{ badge: session.officer.badgeNumber, name: session.officer.name }}
          lockRequester
          onConnected={(name) => {
            t.success(m.setup_connected_as({ name }))
            refresh()
            onDone()
          }}
          onPending={() => {
            t.info(m.setup_request_sent(), { description: m.setup_request_sent_description() })
            refresh()
            onDone()
          }}
          onSkip={() => setConnecting(false)}
        />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      <Button type="button" className="w-full" onClick={() => setConnecting(true)}>
        {m.setup_connect_now()}
      </Button>
      <Button type="button" variant="secondary" className="w-full" onClick={onDone}>
        {m.setup_skip_connect()}
      </Button>
    </div>
  )
}
