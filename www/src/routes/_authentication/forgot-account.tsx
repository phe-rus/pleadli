import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/_authentication/forgot-account')({
  component: RouteComponent,
})

function RouteComponent() {
  return <div>Hello "/_authentication/forgot-account"!</div>
}
