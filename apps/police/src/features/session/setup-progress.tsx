import { NetworkIcon, PoliceBadgeIcon } from '@hugeicons/core-free-icons'
import { motion } from 'framer-motion'
import { useEffect, useState } from 'react'
import { PreAuthLayout, ScreenHeader, screenTransition, type Mode } from './pre-auth-layout'

/** Shown while setup is being saved and the workspace is being opened. The
 * application cannot say how far along it is, so the bar does not pretend to:
 * it moves to show it is working, and the clock shows how long it has been.
 * Setup is only ever asked for once, so the screen also says not to close. */
export function SetupProgress({ mode, title = 'Setting up' }: { mode?: Mode; title?: string }) {
  const [seconds, setSeconds] = useState(0)

  useEffect(() => {
    const timer = setInterval(() => setSeconds((s) => s + 1), 1000)
    return () => clearInterval(timer)
  }, [])

  return (
    <PreAuthLayout mode={mode}>
      <motion.div {...screenTransition} role="status" aria-live="polite" className="flex w-full max-w-sm flex-col gap-6">
        <ScreenHeader
          icon={mode === 'command' ? NetworkIcon : PoliceBadgeIcon}
          title={title}
          description="Saving your details and opening the workspace. This can take a minute the first time. Please keep this window open."
        />
        <div className="flex flex-col gap-2">
          <div className="h-1 overflow-hidden rounded-full bg-border">
            <motion.div className="h-full w-1/3 rounded-full bg-primary" animate={{ x: ['-100%', '300%'] }} transition={{ duration: 1.4, ease: 'easeInOut', repeat: Infinity }} />
          </div>
          <p className="text-xs tabular-nums">{seconds < 3 ? 'Working...' : `Working for ${seconds} seconds...`}</p>
        </div>
      </motion.div>
    </PreAuthLayout>
  )
}
