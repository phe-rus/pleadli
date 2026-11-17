import { WorkspaceShell as Shell } from '@pleadli/shell'
import type { FC, PropsWithChildren } from 'react'
import { shellConfig } from './config'

/** The DPP workspace. What is open is remembered on this machine. */
export const WorkspaceShell: FC<PropsWithChildren> = ({ children }) => (
  <Shell config={shellConfig} storageKey="pleadli:dpp:workspace:v1">
    {children}
  </Shell>
)
