import { ApiError } from '@/lib/api'
import { Button } from '@pleadli/ui/button'
import { t } from '@pleadli/ui/goey-toaster'
import { useMutation } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { prepareNotice } from './data'
import * as m from '@/paraglide/messages'

/** Prepares a notice of this decision for the station that referred the file.
 * Only issued documents go in it, so a draft is flagged before it is sent. */
export function NotifyPoliceButton({ decisionId }: { decisionId: string }) {
  const navigate = useNavigate()
  const prepare = useMutation({
    mutationFn: () => prepareNotice(decisionId),
    onSuccess: (r) => {
      t.success(r.draftDocuments > 0 ? m["interchange.notice.drafts"]({ count: r.draftDocuments }) : m["interchange.notice.prepared"]())
      void navigate({ to: '/incoming' })
    },
    onError: (e) => t.error(m["interchange.notice.failed"](), { description: e instanceof ApiError ? e.message : m["common.try_again"]() }),
  })
  return (
    <Button size="sm" variant="outline" disabled={prepare.isPending} onClick={() => prepare.mutate()}>
      {m["interchange.notice.button"]()}
    </Button>
  )
}
