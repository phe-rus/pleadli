import { Calendar } from '@/features/court'
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/_public/calendar/')({
  component: RouteComponent,
})

/** Hearings, due tasks and review dates, by month. */
function RouteComponent() {
  return (
    <article className="page">
      <Calendar />
    </article>
  )
}
