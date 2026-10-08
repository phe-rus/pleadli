import { NetworkIcon, PoliceBadgeIcon } from '@hugeicons/core-free-icons'
import { motion } from 'framer-motion'
import type { ReactNode } from 'react'
import { PreAuthLayout, ScreenHeader, screenTransition, type Mode } from './pre-auth-layout'

/** A single-screen step before the workspace (sign-in, waiting for the
 * application). `mode` says which installation this is, so a Station and a
 * Command never look alike. */
export function ScreenFrame({ mode, title, description, children }: { mode?: Mode; title: string; description: string; children?: ReactNode }) {
  return (
    <PreAuthLayout mode={mode}>
      <motion.div {...screenTransition} className="flex w-full max-w-sm flex-col gap-6">
        <ScreenHeader centered icon={mode === 'command' ? NetworkIcon : PoliceBadgeIcon} title={title} description={description} />
        {children}
      </motion.div>
    </PreAuthLayout>
  )
}
