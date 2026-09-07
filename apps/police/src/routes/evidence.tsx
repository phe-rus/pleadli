import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/evidence')({
  component: RouteComponent,
})

function RouteComponent() {
  return (
    <div className="flex flex-col gap-1">
      <h1 className="text-xl font-semibold">Evidence</h1>
      <p className="text-sm text-muted-foreground">Not yet built.</p>
    </div>
  )
}
