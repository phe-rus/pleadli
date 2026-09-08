import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/_public/intake/')({
  component: RouteComponent,
})

function RouteComponent() {
  return <div>Hello "/_public/intake/"!</div>
}
