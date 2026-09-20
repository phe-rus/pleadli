import { OfficersPage } from '@/features/officers'
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/_public/officers/')({
  component: RouteComponent,
})

function RouteComponent() {
  return <OfficersPage />
}
