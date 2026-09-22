import { FileWorkspace, isFileTab, type FileTabId } from '@/features/file-workspace'
import { directionsForFileOptions } from '@/features/directions'
import { chargesForFileOptions } from '@/features/charges'
import { reviewsForFileOptions } from '@/features/charging-review'
import { decisionsForFileOptions } from '@/features/decisions'
import { evidenceForFileOptions } from '@/features/evidence'
import { filePeopleOptions, prosecutionFileOptions } from '@/features/prosecution-files'
import { referralsForFileOptions } from '@/features/referrals'
import { reviewNotesForFileOptions } from '@/features/review-notes'
import { statementsForFileOptions } from '@/features/statements'
import { chronologyOptions } from '@/features/workload'
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/_public/files/$fileId')({
  validateSearch: (search: Record<string, unknown>): { tab?: FileTabId } => (isFileTab(search.tab) ? { tab: search.tab } : {}),
  loader: async ({ context, params }) => {
    const { queryClient } = context
    await Promise.all([
      queryClient.query({ ...prosecutionFileOptions(params.fileId), staleTime: 'static' }),
      queryClient.query({ ...filePeopleOptions(params.fileId), staleTime: 'static' }),
      queryClient.query({ ...referralsForFileOptions(params.fileId), staleTime: 'static' }),
      queryClient.query({ ...decisionsForFileOptions(params.fileId), staleTime: 'static' }),
      queryClient.query({ ...chargesForFileOptions(params.fileId), staleTime: 'static' }),
      queryClient.query({ ...statementsForFileOptions(params.fileId), staleTime: 'static' }),
      queryClient.query({ ...evidenceForFileOptions(params.fileId), staleTime: 'static' }),
      queryClient.query({ ...reviewNotesForFileOptions(params.fileId), staleTime: 'static' }),
      queryClient.query({ ...chronologyOptions(params.fileId), staleTime: 'static' }),
      queryClient.query({ ...reviewsForFileOptions(params.fileId), staleTime: 'static' }),
      queryClient.query({ ...directionsForFileOptions(params.fileId), staleTime: 'static' }),
    ])
  },
  component: RouteComponent,
})

function RouteComponent() {
  const { fileId } = Route.useParams()
  const { tab } = Route.useSearch()
  return <FileWorkspace fileId={fileId} tab={tab ?? 'file'} />
}
