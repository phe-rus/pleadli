import { useLocaleFromProfile } from '@/features/i18n'
import { useSession } from '@/features/session'
import { WorkspaceShell as Shell } from '@pleadli/shell'
import type { FC, PropsWithChildren } from 'react'
import { AssistantProvider } from './assistant/assistant-store'
import { shellConfig } from './config'

/** The prisons workspace. What is open is remembered per officer, and held
 * until the officer is known so the workspace that opens is theirs. */
export const WorkspaceShell: FC<PropsWithChildren> = ({ children }) => {
  const { data: session } = useSession()
  useLocaleFromProfile()
  if (!session) return null
  return (
    <AssistantProvider>
      <Shell config={shellConfig} storageKey={`pleadli:prisons:workspace:v2:${session.officer.id}`}>
        {children}
      </Shell>
    </AssistantProvider>
  )
}
