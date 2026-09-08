import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/_public/incidents/')({
  component: RouteComponent,
})

function RouteComponent() {
  return <div>Hello "/_public/incidents/"!</div>
}
