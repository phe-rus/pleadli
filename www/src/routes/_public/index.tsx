import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/_public/')({
  component: RouteComponent
})

function RouteComponent() {
  return (
    <article className="container flex flex-col md:max-w-5xl mx-auto gap-5 py-10">
      <section className="flex flex-col">
        <p className="island-kicker mb-3">Pleadli</p>
        <h1 className="display-title mb-5 max-w-3xl text-4xl leading-[1.02] font-bold tracking-tight text-(--sea-ink) sm:text-6xl">
          Digital justice infrastructure.
        </h1>
        <p className="mb-8 max-w-2xl text-base text-(--sea-ink-soft) sm:text-lg">
          Foundation build in progress. This page will hold Pleadli's public site.
        </p>
      </section>
    </article>
  )
}
