import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/_public/statements/')({
  component: RouteComponent,
})

function RouteComponent() {
  return <div>Hello "/_public/statements/"!</div>
}
