import { ApiError } from '@/lib/api'
import { Button } from '@pleadli/ui/button'
import { t } from '@pleadli/ui/goey-toaster'
import { useMutation } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { prepareNotice } from './data'

/** Prepares a notice of this decision for the station that referred the file.
 * Only issued documents go in it, so a draft is flagged before it is sent. */
export function NotifyPoliceButton({ decisionId }: { decisionId: string }) {
  const navigate = useNavigate()
  const prepare = useMutation({
    mutationFn: () => prepareNotice(decisionId),
    onSuccess: (r) => {
      t.success(r.draftDocuments > 0 ? `Notice prepared. ${r.draftDocuments} draft documents are not in it: issue them first if they should be.` : 'Notice prepared. Save the file to send it.')
      void navigate({ to: '/incoming' })
    },
    onError: (e) => t.error('Could not prepare the notice', { description: e instanceof ApiError ? e.message : 'Please try again.' }),
  })
  return (
    <Button size="sm" variant="outline" disabled={prepare.isPending} onClick={() => prepare.mutate()}>
      Notify the station
    </Button>
  )
}
