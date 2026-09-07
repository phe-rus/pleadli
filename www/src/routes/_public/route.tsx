import { AuthBanner } from '@/components/banners/auth-banner'
import Footer from '@/components/footers/footer'
import Header from '@/components/headers/header'
import { meOptions } from '@/functions/session.func'
import { createFileRoute, Outlet } from '@tanstack/react-router'

export const Route = createFileRoute('/_public')({
  loader: ({ context }) => context.query.query(meOptions()),
  component: RouteComponent,
})

function RouteComponent() {
  const session = Route.useLoaderData()

  return (
    <div className="relative flex min-h-dvh flex-col">
      {session && <AuthBanner user={session.user} />}
      <Header />
      <div className="flex flex-1 flex-col">
        <Outlet />
      </div>
      <Footer />
    </div>
  )
}
