import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/_public/station/')({
  component: RouteComponent,
})

function RouteComponent() {
  return <div>Hello "/_public/station/"!</div>
}
