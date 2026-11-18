import { createFileRoute, redirect } from '@tanstack/react-router'

/** The client area used to live at /orchestra. Old links and bookmarks keep
 * working: everything under it moves to /account, the rest of the path intact. */
export const Route = createFileRoute('/orchestra/$')({
  beforeLoad: ({ params }) => {
    const rest = params._splat ? `/${params._splat}` : ''
    throw redirect({ href: `/account${rest}`, replace: true })
  },
})
