import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/_public/')({
  component: RouteComponent,
})

function RouteComponent() {
  return (
    <article className='container flex flex-col gap-5 py-5'>
      <section>
        <h1>This is the home page</h1>
        <p className="text-muted-foreground">
          This is a simple template for a single page application that uses React Router.
        </p>
      </section>

      <section>
        <h2>Cases opened at this station, stored locally.</h2>
        <p className="text-muted-foreground">
          This is a simple template for a single page application that uses React Router.
        </p>
      </section>
    </article>
  )
}
