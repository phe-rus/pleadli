import { LoaderCircleIcon, PrisonIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useRouterState } from '@tanstack/react-router'
import { FC, PropsWithChildren, useLayoutEffect, useState } from 'react'
import { m } from '@/paraglide/messages'

const MIN_SPLASH_MS = 500
type splashScreenProps = PropsWithChildren<{}>
export const SplashScreen: FC<splashScreenProps> = ({
  children
}) => {
  const [minElapsed, setMinElapsed] = useState(false)
  const [booted, setBooted] = useState(false)
  const isLoading = useRouterState({
    select: (s) => s.status === 'pending',
  })

  useLayoutEffect(() => {
    const timeout = setTimeout(() => setMinElapsed(true), MIN_SPLASH_MS)
    return () => clearTimeout(timeout)
  }, [])

  // The splash is for starting the application. Once it has shown, a later
  // navigation that is still loading must not swap the whole window for it:
  // that would tear down the workspace (open tabs, folded sections, focus)
  // on every click. Route-level loading has its own pending component.
  if (!booted && minElapsed && !isLoading) setBooted(true)

  if (!booted) {
    return (
      <article className='flex h-svh w-full flex-col items-center justify-center gap-4 bg-background'>
        <div>
          <HugeiconsIcon
            icon={PrisonIcon}
            className="size-18"
          />
        </div>
        <section className="flex flex-col items-center gap-1">
          <h1 className="text-2xl">{m.ui_pleadli_prisons()}</h1>
          <p className="text-sm text-muted-foreground">{m.ui_loading_the_register()}</p>
        </section>
        <HugeiconsIcon
          icon={LoaderCircleIcon}
          className='size-5 animate-spin'
        />
      </article>
    )
  }
  return <>{children}</>
}
