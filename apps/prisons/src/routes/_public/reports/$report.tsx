import { ReportRoutePage } from '@/features/reports'
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/_public/reports/$report')({
  component: RouteComponent,
})

function RouteComponent() {
  const { report } = Route.useParams()
  return <ReportRoutePage id={report} />
}
