import { seo } from '@/lib/seo'
import * as m from '@/paraglide/messages'
import { Button } from '@pleadli/ui/button'
import { createFileRoute, Link } from '@tanstack/react-router'

export const Route = createFileRoute('/_public/docs/procurement')({
  head: () => seo({ title: `${m["docs.procurement.title"]()} · Pleadli`, description: m["docs.procurement.lead"](), path: '/docs/procurement' }),
  component: RouteComponent,
})

const sections = [
  { id: 'what', get title() { return m["docs.procurement.what_title"]() }, get body() { return m["docs.procurement.what_body"]() } },
  { id: 'records', get title() { return m["docs.procurement.records_title"]() }, get body() { return m["docs.procurement.records_body"]() } },
  { id: 'works', get title() { return m["docs.procurement.works_title"]() }, get body() { return m["docs.procurement.works_body"]() } },
  { id: 'licence', get title() { return m["docs.procurement.licence_title"]() }, get body() { return m["docs.procurement.licence_body"]() } },
  { id: 'status', get title() { return m["docs.procurement.status_title"]() }, get body() { return m["docs.procurement.status_body"]() } },
  { id: 'law', get title() { return m["docs.procurement.law_title"]() }, get body() { return m["docs.procurement.law_body"]() } },
] as const

/** One page a committee can print. Only statements that are true today. */
function RouteComponent() {
  return (
    <div className="flex flex-col gap-6 print:gap-4">
      <div className="flex flex-col gap-3">
        <h1 className="text-3xl!">{m["docs.procurement.title"]()}</h1>
        <p>{m["docs.procurement.lead"]()}</p>
        <Button variant="outline" className="w-fit print:hidden" onClick={() => window.print()}>
          {m["docs.procurement.print"]()}
        </Button>
      </div>

      {sections.map((section) => (
        <section key={section.id} className="flex flex-col gap-1.5 break-inside-avoid">
          <h2 className="text-xl!">{section.title}</h2>
          <p className="text-sm text-muted-foreground print:text-foreground">{section.body}</p>
        </section>
      ))}

      <section className="flex flex-col gap-1.5 print:hidden">
        <h2 className="text-xl!">{m["docs.procurement.contact_title"]()}</h2>
        <p className="text-sm text-muted-foreground">{m["docs.procurement.contact_body"]()}</p>
        <Link to="/contact" className="w-fit text-sm font-medium text-primary hover:underline">
          {m["docs.procurement.contact_link"]()}
        </Link>
      </section>
    </div>
  )
}
