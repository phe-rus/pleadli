import { ServicesDesk } from '@/features/services/desk'
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/_public/services/')({
  component: RouteComponent,
})

/** The walk-in desk (docs/lawyers/SERVICES.md). */
function RouteComponent() {
  return (
    <article className="page">
      <ServicesDesk />
    </article>
  )
}
