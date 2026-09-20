import { NodeWaiting } from '@/components/node-waiting'
import { PreAuthLayout } from '@/components/pre-auth-layout'
import { useHqConfig } from '@/features/session'
import { AnimatePresence } from 'framer-motion'
import { useState, type ReactNode } from 'react'
import { FacilitySetup } from './facility-setup'
import { HeadOfficeSetup } from './head-office-setup'
import { RoleChoiceScreen } from './role-choice'
import { WorkstationScreen } from './workstation-screen'

type Screen = 'role' | 'facility' | 'head-office' | 'workstation'

/** First launch. Sits in front of the sign-in gate: while the installation has
 * no role, this gate owns the screen entirely. Once a role exists it renders
 * straight through and the sign-in gate takes over. */
export function OnboardingGate({ children }: { children: ReactNode }) {
  const { data: hqConfig, isLoading } = useHqConfig()
  const [screen, setScreen] = useState<Screen>('role')
  const [created, setCreated] = useState(false)

  if (isLoading) return null
  // Facility setup creates the role and the first account in one step, then
  // carries on to an optional Head Office step. It stays up until the officer
  // finishes, even though the role now exists. It is only ever shown for an
  // installation that still has no account, or one this very setup just
  // created: a setup screen left open while the node was restarting must not
  // outlive that, or it would offer to set up an installation that is set up.
  if (screen === 'facility' && (created || hqConfig?.bootstrap !== false)) {
    return <FacilitySetup onBack={() => setScreen('role')} onCreated={() => setCreated(true)} onDone={() => { setCreated(false); setScreen('role') }} />
  }
  // No answer from the node is not "no role yet": never offer first-run
  // setup on an installation whose state is simply unknown.
  if (!hqConfig) return <NodeWaiting />
  // Head Office is created and signed in by one call, so once it has a role
  // there is nothing left for this gate to hold.
  if (hqConfig.role != null) return <>{children}</>
  if (screen === 'head-office') return <HeadOfficeSetup onBack={() => setScreen('role')} />

  return (
    <PreAuthLayout>
      <AnimatePresence mode="wait" initial={false}>
        {screen === 'workstation' ? (
          <WorkstationScreen key="workstation" onBack={() => setScreen('role')} />
        ) : (
          <RoleChoiceScreen key="role" onChooseFacility={() => setScreen('facility')} onChooseHeadOffice={() => setScreen('head-office')} onChooseWorkstation={() => setScreen('workstation')} />
        )}
      </AnimatePresence>
    </PreAuthLayout>
  )
}
