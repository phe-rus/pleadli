import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/_public/')({
  component: RouteComponent
})

function RouteComponent() {
  return (
    <article className="container flex flex-col md:max-w-5xl mx-auto gap-5 py-10">
      <section className="flex flex-col">
        <p className="island-kicker">Pleadli</p>
        <h1>Digital justice infrastructure.</h1>
        <p className="mb-8 max-w-2xl text-base text-(--sea-ink-soft) sm:text-lg">
          Foundation build in progress. This page will hold Pleadli's public site.
        </p>
      </section>
    </article>
  )
}
