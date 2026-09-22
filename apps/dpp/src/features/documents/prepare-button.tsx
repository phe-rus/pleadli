import { ApiError } from '@/lib/api'
import { Button } from '@pleadli/ui/button'
import { t } from '@pleadli/ui/goey-toaster'
import { useNavigate } from '@tanstack/react-router'
import { usePrepareDocument } from './queries'

/** Prepares the document a decision produces (or finds the one that exists)
 * and opens it in the reader. */
export function PrepareDocumentButton({ decisionId, label = 'Prepare' }: { decisionId: string; label?: string }) {
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
          onError: (e) => t.error('Could not prepare the document', { description: e instanceof ApiError ? e.message : 'Please try again.' }),
        })
      }
    >
      {label}
    </Button>
  )
}
