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
        <p className='md:max-w-md'>
          Foundation build in progress. This page will hold Pleadli's public site.
        </p>
      </section>
    </article>
  )
}
