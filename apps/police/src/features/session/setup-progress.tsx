import * as m from '@/paraglide/messages'
import { NetworkIcon, PoliceBadgeIcon } from '@hugeicons/core-free-icons'
import { motion } from 'framer-motion'
import { useEffect, useState } from 'react'
import { PreAuthLayout, ScreenHeader, screenTransition, type Mode } from './pre-auth-layout'

/** Shown while the application is working and cannot say how far along it is
 * (setup being saved, or a session being opened after sign-in): the bar does
 * not pretend to know a duration, it moves to show it is working, and the
 * clock shows how long it has been so a wait never reads as "nothing is
 * happening". */
export function SetupProgress({
  mode,
  title = m["pre_auth.setting_up"](),
  description = m["pre_auth.setting_up_desc"](),
}: {
  mode?: Mode
  title?: string
  description?: string
}) {
  const [seconds, setSeconds] = useState(0)

  useEffect(() => {
    const timer = setInterval(() => setSeconds((s) => s + 1), 1000)
    return () => clearInterval(timer)
  }, [])

  return (
    <PreAuthLayout mode={mode}>
      <motion.div {...screenTransition} role="status" aria-live="polite" className="flex w-full max-w-sm flex-col gap-6">
        <ScreenHeader icon={mode === 'command' ? NetworkIcon : PoliceBadgeIcon} title={title} description={description} />
        <div className="flex flex-col gap-2">
          <div className="h-1 overflow-hidden rounded-full bg-border">
            <motion.div className="h-full w-1/3 rounded-full bg-primary" animate={{ x: ['-100%', '300%'] }} transition={{ duration: 1.4, ease: 'easeInOut', repeat: Infinity }} />
          </div>
          <p className="text-xs tabular-nums">{seconds < 3 ? m["pre_auth.working"]() : m["pre_auth.working_for"]({ seconds })}</p>
        </div>
      </motion.div>
    </PreAuthLayout>
  )
}
