import { JusticeScale01Icon, LoaderCircleIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useRouterState } from '@tanstack/react-router'
import { FC, PropsWithChildren, useLayoutEffect, useState } from 'react'

const MIN_SPLASH_MS = 500
type splashScreenProps = PropsWithChildren<{}>
export const SplashScreen: FC<splashScreenProps> = ({
  children
}) => {
  const [minElapsed, setMinElapsed] = useState(false)
  const isLoading = useRouterState({
    select: (s) => s.status === 'pending',
  })

  useLayoutEffect(() => {
    const timeout = setTimeout(() => setMinElapsed(true), MIN_SPLASH_MS)
    return () => clearTimeout(timeout)
  }, [])

  if (isLoading || !minElapsed) {
    return (
      <article className='flex h-svh w-full flex-col items-center justify-center gap-4 bg-background'>
        <div>
          <HugeiconsIcon
            icon={JusticeScale01Icon}
            className="size-18"
          />
        </div>
        <section className="flex flex-col items-center gap-1">
          <h1 className="text-2xl">Pleadli Courts</h1>
          <p className="text-sm text-muted-foreground">Opening the bench…</p>
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
