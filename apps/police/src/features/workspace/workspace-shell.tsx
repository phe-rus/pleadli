import { useInstallation } from '@/features/session'
import { WorkspaceShell as Shell } from '@pleadli/shell'
import type { FC, PropsWithChildren } from 'react'
import { shellConfig } from './config'

/** The Police workspace. What is open is remembered on this machine, for this
 * installation: a command never reopens a station's tabs. */
export const WorkspaceShell: FC<PropsWithChildren> = ({ children }) => {
  const { data: installation } = useInstallation()
  return (
    <Shell config={shellConfig} storageKey={`pleadli:police:workspace:v1:${installation?.mode ?? ''}:${installation?.name ?? ''}`}>
      {children}
    </Shell>
  )
}
