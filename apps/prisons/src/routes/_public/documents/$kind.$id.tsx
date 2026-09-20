import { DocumentPage } from '@/features/documents'
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/_public/documents/$kind/$id')({
  component: RouteComponent,
})

function RouteComponent() {
  const { kind, id } = Route.useParams()
  return <DocumentPage kind={kind} recordId={id} />
}
