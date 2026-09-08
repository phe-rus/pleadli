import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/_public/investigations/')({
  component: RouteComponent,
})

function RouteComponent() {
  return <div>Hello "/_public/investigations/"!</div>
}
