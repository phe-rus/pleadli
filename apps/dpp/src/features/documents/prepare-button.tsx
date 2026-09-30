import { ApiError } from '@/lib/api'
import { Button } from '@pleadli/ui/button'
import { t } from '@pleadli/ui/goey-toaster'
import { useNavigate } from '@tanstack/react-router'
import { usePrepareDocument } from './queries'
import * as m from '@/paraglide/messages'

/** Prepares the document a decision produces (or finds the one that exists)
 * and opens it in the reader. */
export function PrepareDocumentButton({ decisionId, label = m["doc.prepare"]() }: { decisionId: string; label?: string }) {
  const prepare = usePrepareDocument()
  const navigate = useNavigate()
  return (
    <Button
      size="sm"
      variant="outline"
      disabled={prepare.isPending}
      onClick={() =>
        prepare.mutate(decisionId, {
          onSuccess: (doc) => void navigate({ to: '/documents/$documentId', params: { documentId: doc.id } }),
          onError: (e) => t.error(m["doc.prepare_failed"](), { description: e instanceof ApiError ? e.message : m["common.try_again"]() }),
        })
      }
    >
      {label}
    </Button>
  )
}
