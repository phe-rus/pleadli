import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/_protected/admin/')({
  component: RouteComponent,
})

function RouteComponent() {
  const { session } = Route.useRouteContext()
  return (
    <div className="container mx-auto p-8">
      <h1 className="mb-2 text-2xl font-semibold">Platform administration</h1>
      <p className="text-muted-foreground">Signed in as {session.user.email}.</p>
    </div>
  )
}
