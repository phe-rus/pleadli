import { seo } from '@/lib/seo'
import { docsNav } from '@/data/docs'
import * as m from '@/paraglide/messages'
import { createFileRoute, Link } from '@tanstack/react-router'

export const Route = createFileRoute('/_public/docs/')({
  head: () => seo({ title: `${m['polish.guide_title']()} · Pleadli`, description: m['polish.guide_lead'](), path: '/docs' }),
  component: RouteComponent,
})

function RouteComponent() {
  const descriptions: Record<string, string> = {
    'getting-started': m['polish.guide_start'](),
    'how-it-works': m['polish.guide_work'](),
    applications: m['polish.guide_apps'](),
    security: m['polish.guide_security'](),
    documents: m['polish.guide_documents'](),
    ai: m['polish.guide_ai'](),
  }
  return <div className="flex flex-col gap-8">
    <div className="flex flex-col gap-4"><span className="text-xs font-medium text-primary">{m['nav.docs']()}</span><h1 className="text-3xl! font-semibold tracking-tight md:text-4xl!">{m['polish.guide_title']()}</h1><p className="max-w-xl text-base! leading-relaxed text-muted-foreground">{m['polish.guide_lead']()}</p></div>
    <Link to="/docs/getting-started" className="flex flex-col gap-3 rounded-2xl bg-primary/5 p-6 transition-colors hover:bg-primary/10"><span className="text-xs font-medium text-primary">{m['polish.guide_first']()}</span><h2 className="text-xl! font-semibold">{m['docs.nav.getting_started']()} <span aria-hidden="true">↗</span></h2><p className="text-sm text-muted-foreground">{m['polish.guide_start']()}</p></Link>
    <div className="grid gap-4 sm:grid-cols-2">
      {docsNav.filter(item => item.slug && item.slug !== 'getting-started').map(item => <Link key={item.to} to={item.to} className="group flex flex-col gap-3 rounded-2xl border border-border/60 p-5 transition-colors hover:bg-muted/50"><h2 className="flex items-center justify-between gap-3 text-base! font-semibold">{item.title}<span aria-hidden="true" className="text-muted-foreground transition-transform group-hover:translate-x-1">→</span></h2><p className="text-sm leading-relaxed text-muted-foreground">{descriptions[item.slug]}</p></Link>)}
    </div>
    <p className="text-sm text-muted-foreground">{m['polish.guide_help']()} <Link to="/contact" className="font-medium text-primary">{m['nav.contact']()} ↗</Link></p>
  </div>
}
