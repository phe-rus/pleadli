import { ReceivePage } from '@/features/procedures'
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/_public/procedures/receive')({
  component: RouteComponent,
})

function RouteComponent() {
  return <ReceivePage />
}
