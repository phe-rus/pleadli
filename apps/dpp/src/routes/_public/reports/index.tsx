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
          <h1>Reports</h1>
          <p>Answers to operational questions over a period, printable and exportable. Not built yet.</p>
        </div>
      </header>
      <Planned
        title="Reports to come"
        covers={['Files received, by period and by Police station', 'Charging decisions, by type and over time', 'Files returned to Police, and how long they were away', 'Reviews pending, and how long they have waited', 'Workload and capacity', 'Court matters']}
      >
        Each report will be read from the same record as the rest of the application, so its numbers match what you see elsewhere.
      </Planned>
    </article>
  )
}
