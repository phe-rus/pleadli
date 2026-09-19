import { PreAuthLayout, ScreenHeader, screenTransition } from '@/components/pre-auth-layout'
import { ConnectFlow, StepsProgress, cancelConnection, connectSteps, refreshConnection, type PeerSyncConfig } from '@/features/facilities'
import { useHqConfig } from '@/features/session'
import { CheckmarkCircle02Icon, Clock01Icon, NetworkIcon } from '@hugeicons/core-free-icons'
import { Button } from '@pleadli/ui/button'
import { t } from '@pleadli/ui/goey-toaster'
import { useQueryClient } from '@tanstack/react-query'
import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useState, type ReactNode } from 'react'

const POLL_MS = 4000

/**
 * First launch of a facility installation: connect to Head Office by picking
 * the facility from its roster, or carry on alone. Connecting is optional and
 * never blocks local work. A request Head Office has not decided yet waits on
 * its own screen that polls every few seconds and moves on by itself when
 * approved, or lets the officer carry on and finish setting up meanwhile.
 *
 * The gate only shows while the installation has no accounts (the persisted
 * first-launch state), so it never returns once the first account exists;
 * Settings, Network and sync takes over from there.
 */
export function FacilityOnboardingGate({ children }: { children: ReactNode }) {
  const { data: state, isLoading } = useHqConfig()
  const queryClient = useQueryClient()
  const [skipped, setSkipped] = useState(false)
  const [confirmed, setConfirmed] = useState<string | null>(null)

  if (isLoading || !state) return null

  const refreshState = () => {
    queryClient.invalidateQueries({ queryKey: ['systemState'] })
    queryClient.invalidateQueries({ queryKey: ['peerSyncConfig'] })
  }
  // Shown before the state flips to connected, so the officer sees the result.
  const connected = (facilityName: string) => {
    setConfirmed(facilityName)
    refreshState()
  }

  if (confirmed !== null) return <ConnectedScreen facilityName={confirmed} onContinue={() => setConfirmed(null)} />

  const needsChoice = state.role === 'facility' && state.bootstrap && !state.paired && !skipped
  if (!needsChoice) return <>{children}</>

  if (state.connection === 'pending') {
    return <WaitingScreen onConnected={connected} onRejected={refreshState} onContinue={() => setSkipped(true)} onCancelled={refreshState} />
  }
  if (state.connection === 'rejected') {
    return <RejectedScreen onCancelled={refreshState} onContinue={() => setSkipped(true)} />
  }
  return <ConnectScreen onConnected={connected} onPending={refreshState} onSkip={() => setSkipped(true)} />
}

function Shell({ stepKey, children }: { stepKey: string; children: ReactNode }) {
  return (
    <PreAuthLayout>
      <AnimatePresence mode="wait" initial={false}>
        <motion.div key={stepKey} {...screenTransition} className="flex w-full max-w-md flex-col gap-6">
          {children}
        </motion.div>
      </AnimatePresence>
    </PreAuthLayout>
  )
}

function ConnectScreen({ onConnected, onPending, onSkip }: { onConnected: (name: string) => void; onPending: () => void; onSkip: () => void }) {
  return (
    <Shell stepKey="connect">
      <ScreenHeader
        icon={NetworkIcon}
        title="Connect to Head Office"
        description="Pick your facility from Head Office's list. You do not retype its details. Working offline is fine: you can skip this and connect later from Settings."
      />
      <div className="rounded-lg border border-border bg-card p-4 shadow-xs">
        <ConnectFlow scope="onboarding" onConnected={onConnected} onPending={onPending} onSkip={onSkip} />
      </div>
    </Shell>
  )
}

function WaitingScreen({
  onConnected,
  onRejected,
  onContinue,
  onCancelled,
}: {
  onConnected: (name: string) => void
  onRejected: () => void
  onContinue: () => void
  onCancelled: () => void
}) {
  const [config, setConfig] = useState<PeerSyncConfig | null>(null)
  const [cancelling, setCancelling] = useState(false)

  useEffect(() => {
    let live = true
    const check = async () => {
      try {
        const next = await refreshConnection('onboarding')
        if (!live) return
        setConfig(next)
        if (next.connectionState === 'connected') onConnected(next.facilityDisplayName ?? 'this facility')
        else if (next.connectionState === 'rejected') onRejected()
      } catch {
        // Head Office may be unreachable for a while; keep waiting.
      }
    }
    void check()
    const timer = setInterval(check, POLL_MS)
    return () => {
      live = false
      clearInterval(timer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const cancel = async () => {
    setCancelling(true)
    try {
      await cancelConnection('onboarding')
      onCancelled()
    } catch {
      t.error('Could not cancel the request')
      setCancelling(false)
    }
  }

  return (
    <Shell stepKey="waiting">
      <StepsProgress steps={connectSteps} current={2} />
      <ScreenHeader
        icon={Clock01Icon}
        title="Waiting for Head Office to approve"
        description={
          config?.facilityDisplayName
            ? `Your request to connect as ${config.facilityDisplayName} has reached Head Office. This screen moves on by itself when it is approved.`
            : 'Your request has reached Head Office. This screen moves on by itself when it is approved.'
        }
      />
      <div className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4 text-sm shadow-xs">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="relative flex size-2">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-amber-500/60" />
            <span className="relative inline-flex size-2 rounded-full bg-amber-500" />
          </span>
          Checking every few seconds
        </div>
        {config?.requestedByName && (
          <p className="text-xs text-muted-foreground">
            Requested by <span className="font-medium text-foreground">{config.requestedByName}</span> ({config.requestedByBadge}). Head
            Office sees your name and badge number when it decides.
          </p>
        )}
        <Button type="button" className="w-full" onClick={onContinue}>
          Continue working while I wait
        </Button>
        <Button type="button" variant="ghost" className="w-full" disabled={cancelling} onClick={cancel}>
          Cancel request
        </Button>
      </div>
    </Shell>
  )
}

function RejectedScreen({ onCancelled, onContinue }: { onCancelled: () => void; onContinue: () => void }) {
  const [busy, setBusy] = useState(false)
  return (
    <Shell stepKey="rejected">
      <ScreenHeader
        icon={NetworkIcon}
        title="Head Office did not approve the request"
        description="Check the facility number with Head Office, or ask for an activation code and try again. You can also carry on offline and connect later."
      />
      <div className="flex flex-col gap-2 rounded-lg border border-border bg-card p-4 shadow-xs">
        <Button
          type="button"
          className="w-full"
          disabled={busy}
          onClick={async () => {
            setBusy(true)
            try {
              await cancelConnection('onboarding')
              onCancelled()
            } catch {
              t.error('Could not reset the request')
              setBusy(false)
            }
          }}
        >
          Try again
        </Button>
        <Button type="button" variant="secondary" className="w-full" onClick={onContinue}>
          Continue without Head Office
        </Button>
      </div>
    </Shell>
  )
}

function ConnectedScreen({ facilityName, onContinue }: { facilityName: string; onContinue: () => void }) {
  return (
    <Shell stepKey="connected">
      <StepsProgress steps={connectSteps} current={3} />
      <ScreenHeader
        icon={CheckmarkCircle02Icon}
        title={`Connected as ${facilityName}`}
        description="This installation is linked to Head Office. Your records stay on this machine and Head Office receives updates in the background."
      />
      <Button type="button" className="w-full" onClick={onContinue}>
        Continue setting up
      </Button>
    </Shell>
  )
}
