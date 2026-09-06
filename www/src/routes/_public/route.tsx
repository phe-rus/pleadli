import Footer from '@/components/footers/footer'
import Header from '@/components/headers/header'
import { createFileRoute, Outlet } from '@tanstack/react-router'

export const Route = createFileRoute('/_public')({
  component: RouteComponent,
})

function RouteComponent() {
  return (
    <div className="relative flex min-h-dvh flex-col">
      <Header />
      <div className="flex flex-1 flex-col">
        <Outlet />
      </div>
      <Footer />
    </div>
  )
}
