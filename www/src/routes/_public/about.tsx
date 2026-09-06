import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/_public/about')({
  component: RouteComponent,
})

function RouteComponent() {
  return (
    <article className="container flex flex-col md:max-w-5xl mx-auto gap-5 py-10">
      <section className="flex flex-col">
        <p>About</p>
        <h1>
          A small starter with room to grow.
        </h1>
        <p className="max-w-md text-muted-foreground">
          TanStack Start gives you type-safe routing, server functions, and
          modern SSR defaults. Use this as a clean foundation, then layer in
          your own routes, styling, and add-ons.
        </p>
      </section>
    </article>
  )
}
