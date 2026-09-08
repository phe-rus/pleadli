import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/_public/people/')({
  component: RouteComponent,
})

function RouteComponent() {
  return (
    <article className="container flex flex-col gap-5 pt-5 pb-20">
      <section className="flex flex-col">
        <h1>People</h1>
        <p>Placeholder nothing here yet.</p>
      </section>
    </article>
  )
}

