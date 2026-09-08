import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/_public/search/')({
  component: RouteComponent,
})

function RouteComponent() {
  return (
    <article className="container flex flex-col gap-5 pt-5 pb-20">
      <div className="flex-1">Hello "/_public/search/"!</div>
    </article>
  )
}
