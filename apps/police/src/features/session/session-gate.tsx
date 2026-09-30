import * as m from '@/paraglide/messages'
import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useState, type ReactNode } from 'react'
import { onSessionEnded } from '@/lib/api'
import { Onboarding } from './onboarding'
import { installationOptions, meOptions, useInstallation, useMe } from './queries'
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

  // Clearing drops what was on screen (a real privacy property: the next
  // officer at a shared terminal must never see the last one's data). Do not
  // trust that an observer notices the clear and refetches on its own: fetch
  // both queries directly and await them, so the cache genuinely holds fresh
  // data the moment this returns, not just a hope that something else (for
  // `me`, otherwise a once-a-minute background interval) eventually does.
  const [transitioning, setTransitioning] = useState(false)
  const changed = () => {
    queryClient.clear()
    setTransitioning(true)
    void Promise.all([queryClient.fetchQuery(meOptions()), queryClient.fetchQuery(installationOptions())]).finally(() => {
      setTransitioning(false)
      onChange()
    })
  }

  if (transitioning || isLoading || (installation?.installed && meLoading)) {
    return settingUp ? (
      <SetupProgress mode={installation?.mode ?? undefined} />
    ) : (
      <SetupProgress
        mode={installation?.mode ?? undefined}
        title={m["pre_auth.signing_in_title"]()}
        description={m["pre_auth.signing_in_desc"]()}
      />
    )
  }
  if (isError || !installation) {
    return (
      <ScreenFrame title={m["pre_auth.waiting_title"]()} description={m["pre_auth.waiting_desc"]()}>
        <button type="button" onClick={() => void refetch()} className="w-fit cursor-pointer text-primary">
          {m["common.try_again_button"]()}
        </button>
      </ScreenFrame>
    )
  }
  if (!installation.installed) return <Onboarding installation={installation} onDone={() => { setSettingUp(true); changed() }} />
  if (!me) return <SignInScreen installation={installation} onSignedIn={changed} />
  return <>{children}</>
}
