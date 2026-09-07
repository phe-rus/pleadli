import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/_public/$')({
  component: RouteComponent,
})

function RouteComponent() {
  return (
    <article>
      <h2>Example template</h2>
    </article>
  )
}
