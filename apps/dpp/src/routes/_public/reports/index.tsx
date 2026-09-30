import * as m from '@/paraglide/messages'
import { Planned } from '@/components/planned'
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/_public/reports/')({
  component: RouteComponent,
})

/** Reserved. Reports answer operational questions over a period; they belong
 * here and not on the Overview. None is built yet, so none is shown. */
function RouteComponent() {
  return (
    <article className="page page-narrow">
      <header className="page-header">
        <div>
          <h1>{m["nav.item.reports"]()}</h1>
          <p>{m["page.reports.about"]()}</p>
        </div>
      </header>
      <Planned
        title={m["page.reports.coming"]()}
        covers={[m["page.reports.r1"](), m["page.reports.r2"](), m["page.reports.r3"](), m["page.reports.r4"](), m["page.reports.r5"](), m["page.reports.r6"]()]}
      >
        {m["page.reports.body"]()}
      </Planned>
    </article>
  )
}
