import { useWorkspace } from '@/features/workspace/tabs-store'
import { useEffect } from 'react'
import { documentKindLabel, type DocumentKind } from './schema'

/** Names the document's tab after what it is and whom it is for, once the
 * record has loaded, so two open dossiers are never the same tab title. */
export function useDocumentTab(kind: DocumentKind, recordId: string, subject: string | null | undefined) {
  const { renameTab } = useWorkspace()
  useEffect(() => {
    if (subject) renameTab(`document:${kind}:${recordId}`, `${documentKindLabel[kind]} · ${subject}`)
  }, [kind, recordId, subject, renameTab])
}
