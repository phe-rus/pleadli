import { NodeWaiting } from '@/components/node-waiting'
import { PreAuthLayout } from '@/components/pre-auth-layout'
import { loadAccent, SharedSetup } from '@/features/session/shared-flow'
import { useHqConfig } from '@/features/session'
import { m } from '@/paraglide/messages'
import { Button } from '@pleadli/ui/button'
import { useQueryClient } from '@tanstack/react-query'
import { useRouter } from '@tanstack/react-router'
import { useEffect, useState, type ReactNode } from 'react'
import { HeadOfficeStep } from './head-office-step'
import { WorkstationScreen } from './workstation-screen'

type Screen = 'setup' | 'workstation' | 'connect'

/** First launch. Sits in front of the sign-in gate: while the installation has
 * no role, this gate owns the screen entirely. Once a role exists it renders
 * straight through and the sign-in gate takes over.
 *
 * Setup is the same flow every Pleadli app uses. It saves everything in one
 * step on the node and signs the first administrator in, but the screens stay
 * up until the person finishes, even though a role now exists. A facility then
 * gets the optional Head Office step; Head Office is done. */
export function OnboardingGate({ children }: { children: ReactNode }) {
  const { data: hqConfig, isLoading } = useHqConfig()
  const [screen, setScreen] = useState<Screen>('setup')
  const [running, setRunning] = useState(false)
  const queryClient = useQueryClient()
  const router = useRouter()
  useEffect(loadAccent, [])

  if (isLoading) return null
  // No answer from the node is not "no role yet": never offer first-run
  // setup on an installation whose state is simply unknown.
  if (!hqConfig) return <NodeWaiting />
  const settled = async () => {
    // The router tried its first route before anyone was signed in, so its
    // loaders run again now that there is a session.
    setRunning(false)
    await queryClient.invalidateQueries()
    await router.invalidate()
  }
  if (screen === 'connect') {
    return (
      <PreAuthLayout>
        <HeadOfficeStep onDone={() => { setScreen('setup'); void settled() }} />
      </PreAuthLayout>
    )
  }
  if (hqConfig.role != null && !running) return <>{children}</>
  if (screen === 'workstation') {
    return (
      <PreAuthLayout>
        <WorkstationScreen onBack={() => setScreen('setup')} />
      </PreAuthLayout>
    )
  }
  return (
    <SharedSetup
      welcomeAction={
        <Button variant="outline" onClick={() => setScreen('workstation')}>
          {m.onboarding_role_workstation()}
        </Button>
      }
      onDone={(headOffice) => {
        if (headOffice) void settled()
        else setScreen('connect')
      }}
      onStarted={() => setRunning(true)}
    />
  )
}
