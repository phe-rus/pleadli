import { useActor } from '@/features/installation'
import { WorkspaceShell as Shell } from '@pleadli/shell'
import type { FC, PropsWithChildren } from 'react'
import { shellConfig } from './config'

/** The Lawyers workspace. What is open is remembered on this machine, **per person**: open tabs and recent items carry
 * matter titles and court numbers, so a restricted matter one person opened must never reappear in the next person's
 * tab bar. The shell remounts when the key changes, so signing in as someone else opens that person's own workspace. */
export const WorkspaceShell: FC<PropsWithChildren> = ({ children }) => {
  const actor = useActor()
  return (
    <Shell config={shellConfig} storageKey={`pleadli:lawyers:workspace:v2:${actor?.id ?? 'signed-out'}`}>
      {children}
    </Shell>
  )
}
