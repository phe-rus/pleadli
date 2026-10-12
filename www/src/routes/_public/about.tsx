import { seo } from '@/lib/seo'
import { CONTACT } from '@/data/contact'
import { Button } from '@pleadli/ui/button'
import * as m from '@/paraglide/messages'
import { createFileRoute, Link } from '@tanstack/react-router'

export const Route = createFileRoute('/_public/about')({
  head: () => seo({ title: m['about.meta_title'](), description: m['polish.about_lead'](), path: '/about' }),
  component: RouteComponent,
})

function RouteComponent() {
  return <article className="container w-full md:max-w-6xl">
    <section className="editorial-hero">
      <img src="/favicon.svg" alt="" className="size-14" />
      <span className="text-sm font-medium text-primary">{m['about.badge']()} Pleadli</span>
      <h1 className="max-w-3xl text-4xl! font-semibold leading-tight! tracking-tight md:text-6xl!">{m['polish.about_title']()}</h1>
      <p className="max-w-2xl text-lg! leading-relaxed text-muted-foreground">{m['polish.about_lead']()}</p>
    </section>
    <section className="grid gap-10 rounded-[2rem] bg-muted/40 p-8 sm:p-12 md:grid-cols-2">
      <h2 className="max-w-md text-3xl! font-semibold leading-tight! tracking-tight md:text-4xl!">{m['polish.why_title']()}</h2>
      <div className="flex flex-col gap-5 text-base leading-relaxed text-muted-foreground"><p>{m['polish.why_one']()}</p><p>{m['polish.why_two']()}</p></div>
    </section>
    <section className="grid gap-8 py-16 md:grid-cols-3 md:py-24">
      {[
        { title: m['polish.care_title'](), body: m['polish.care']() },
        { title: m['polish.ownership_title'](), body: m['polish.ownership']() },
        { title: m['polish.start_title'](), body: m['polish.start']() },
      ].map((item, index) => <div key={item.title} className="flex flex-col gap-4"><span className="text-sm font-medium text-primary">0{index + 1}</span><h2 className="text-xl! font-semibold tracking-tight">{item.title}</h2><p className="text-base! leading-relaxed text-muted-foreground">{item.body}</p></div>)}
    </section>
    <section className="mb-16 flex flex-col gap-6 rounded-[2rem] bg-primary/5 p-8 sm:p-12 md:flex-row md:items-center md:justify-between">
      <div className="flex flex-col gap-3"><span className="text-xs font-medium text-primary">{m['contact.founder']()}</span><h2 className="text-2xl! font-semibold tracking-tight">{CONTACT.person}</h2><p className="max-w-md text-base! text-muted-foreground">{m['polish.founder']()}</p></div>
      <Button size="lg" className="w-fit shrink-0 rounded-full" nativeButton={false} render={<Link to="/contact" />}>{m['launch.talk']()}</Button>
    </section>
  </article>
}
