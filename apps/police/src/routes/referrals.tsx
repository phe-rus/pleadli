import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/referrals')({
  component: RouteComponent,
})

function RouteComponent() {
  return (
    <div className="flex flex-col gap-1">
      <h1 className="text-xl font-semibold">Referrals</h1>
      <p className="text-sm text-muted-foreground">
        Referring a case to the DPP will carry its Pleadli identity forward. Not yet built.
      </p>
    </div>
  )
}
