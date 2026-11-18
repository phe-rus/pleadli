import marketingCss from '@/styles/marketing.css?url'
import Footer from '@/components/footers/footer'
import Header from '@/components/headers/header'
import { meOptions } from '@/functions/session.func'
import { createFileRoute, Outlet } from '@tanstack/react-router'

export const Route = createFileRoute('/_public')({
  head: () => ({ links: [{ rel: 'stylesheet', href: marketingCss }] }),
  loader: ({ context }) => context.query.query(meOptions()),
  component: RouteComponent,
})

function RouteComponent() {
  const session = Route.useLoaderData()

  return (
    <div className="marketing-site relative flex min-h-dvh flex-col">
      <Header signedIn={!!session} staff={session?.user.role === 'admin'} />
      <div className="flex flex-1 flex-col">
        <Outlet />
      </div>
      <Footer />
    </div>
  )
}
