import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/_public/settings/')({
  component: RouteComponent,
})

function RouteComponent() {
  return <div>Hello "/_public/settings/"!</div>
}
