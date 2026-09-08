import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/_public/statements/')({
  component: RouteComponent,
})

function RouteComponent() {
  return (
    <article className="container flex flex-col gap-5 pt-5 pb-20">
      <section className="flex flex-col gap-2">
        <h1 className="font-heading text-2xl md:text-5xl">Statements</h1>
        <p className="text-xs/relaxed text-muted-foreground">Placeholder — nothing here yet.</p>
      </section>
    </article>
  )
}

