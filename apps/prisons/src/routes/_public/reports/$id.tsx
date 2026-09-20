import { ReportPage } from '@/features/reports'
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/_public/reports/$id')({
  component: RouteComponent,
})

function RouteComponent() {
  const { id } = Route.useParams()
  return <ReportPage id={id} />
}
