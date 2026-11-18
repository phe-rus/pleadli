import { createFileRoute, redirect } from '@tanstack/react-router'

/** /dashboard is where people look for their management area. It is Pleadli
 * Account (/account), with the rest of the path intact. */
export const Route = createFileRoute('/dashboard/$')({
  beforeLoad: ({ params }) => {
    const rest = params._splat ? `/${params._splat}` : ''
    throw redirect({ href: `/account${rest}`, replace: true })
  },
})
