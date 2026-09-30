import * as m from '@/paraglide/messages'
import { Calendar } from '@/features/court'
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/_public/calendar/')({
  component: RouteComponent,
})

/** Hearings, due tasks and review dates, by month. */
function RouteComponent() {
  return (
    <article className="page">
      <header className="page-header">
        <div>
          <h1>{m["nav.item.calendar"]()}</h1>
          <p>{m["page.calendar.about"]()}</p>
        </div>
      </header>
      <Calendar />
    </article>
  )
}
