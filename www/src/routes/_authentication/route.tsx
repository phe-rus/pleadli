import { createFileRoute, Outlet } from '@tanstack/react-router'

export const Route = createFileRoute('/_authentication')({
  component: RouteComponent,
})

function RouteComponent() {
  return <Outlet />
}
