import { DocumentReader, documentOptions, documentsOptions } from '@/features/documents'
import { decisionsForFileOptions } from '@/features/decisions'
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/_public/documents/$documentId')({
  loader: async ({ context, params }) => {
    const { queryClient } = context
    const doc = await queryClient.query({ ...documentOptions(params.documentId), staleTime: 'static' })
    await Promise.all([
      queryClient.query({ ...documentsOptions(), staleTime: 'static' }),
      queryClient.query({ ...decisionsForFileOptions(doc.prosecutionFileId), staleTime: 'static' }),
    ])
  },
  component: RouteComponent,
})

function RouteComponent() {
  const { documentId } = Route.useParams()
  return <DocumentReader id={documentId} />
}
