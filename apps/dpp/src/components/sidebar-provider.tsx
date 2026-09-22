import { WorkspaceShell } from '@/features/workspace'
import type { FC, PropsWithChildren } from 'react'

/** The application frame every page renders inside. */
export const SidebarProvider: FC<PropsWithChildren> = ({ children }) => <WorkspaceShell>{children}</WorkspaceShell>
