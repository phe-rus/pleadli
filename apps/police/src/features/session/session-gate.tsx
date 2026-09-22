import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useState, type ReactNode } from 'react'
import { onSessionEnded } from '@/lib/api'
import { Onboarding } from './onboarding'
import { useInstallation, useMe } from './queries'
import { ScreenFrame } from './screen-frame'
import { SignInScreen } from './sign-in-screen'
import { SetupProgress } from './setup-progress'

/** Everything sits behind this. First launch shows setup; after that nothing is
 * reachable without a signed-in officer. It stands outside the router, so the
 * decision is made before any route loads and its loaders are refused. The
 * application itself refuses every call without a session; this screen is the
 * courtesy in front of that. When the sign-in changes, what was on screen for
 * one officer is dropped so the next one never sees it. */
export function SessionGate({ children, onChange }: { children: ReactNode; onChange: () => void }) {
  const queryClient = useQueryClient()
  const { data: installation, isLoading, isError, refetch } = useInstallation()
  const { data: me, isLoading: meLoading } = useMe()
  // Setup has just been saved. Changing clears what was known, so until the
  // installation is read again the screen would be empty; this keeps the
  // progress screen up across that gap.
  const [settingUp, setSettingUp] = useState(false)

  useEffect(() => {
    if (me) setSettingUp(false)
  }, [me])

  useEffect(
    () =>
      onSessionEnded(() => {
        queryClient.clear()
        onChange()
      }),
    [queryClient, onChange],
  )

  const changed = () => {
    queryClient.clear()
    onChange()
  }

  if (isLoading || (installation?.installed && meLoading)) return settingUp ? <SetupProgress mode={installation?.mode ?? undefined} /> : null
  if (isError || !installation) {
    return (
      <ScreenFrame title="Waiting for the application" description="Pleadli Police could not reach its own data. If it keeps failing, restart the application.">
        <button type="button" onClick={() => void refetch()} className="w-fit cursor-pointer text-primary">
          Try again
        </button>
      </ScreenFrame>
    )
  }
  if (!installation.installed) return <Onboarding installation={installation} onDone={() => { setSettingUp(true); changed() }} />
  if (!me) return <SignInScreen installation={installation} onSignedIn={changed} />
  return <>{children}</>
}
