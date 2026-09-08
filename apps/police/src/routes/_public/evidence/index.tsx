import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/_public/evidence/')({
  component: RouteComponent,
})

function RouteComponent() {
  return <div>Hello "/_public/evidence/"!</div>
}
