import { NewReportPage } from '@/features/reports'
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/_public/reports/new')({
  component: RouteComponent,
})

function RouteComponent() {
  return <NewReportPage />
}
