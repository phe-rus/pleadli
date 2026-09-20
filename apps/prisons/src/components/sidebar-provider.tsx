import { WorkspaceShell } from '@/features/workspace/workspace-shell'
import { FC, PropsWithChildren } from 'react'

/** The workspace shell around every public route: Policy (the navigator,
 * tabs, and context column) for prison work. See `features/workspace/`. */
export const SidebarProvider: FC<PropsWithChildren> = ({ children }) => {
  return <WorkspaceShell>{children}</WorkspaceShell>
}