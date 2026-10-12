import * as m from '@/paraglide/messages'
import { CONTACT } from '@/data/contact'
import { Link } from '@tanstack/react-router'

const columns = [
  {
    get title() { return m["footer.product"]() },
    links: [
      { get label() { return m["nav.products"]() }, to: '/products' },
      { get label() { return m["nav.pricing"]() }, to: '/licensing' },
      { get label() { return m["nav.downloads"]() }, to: '/downloads' },
      { get label() { return m["nav.roadmap"]() }, to: '/roadmap' },
    ],
  },
  {
    get title() { return m["footer.learn"]() },
    links: [
      { get label() { return m["nav.getting_started"]() }, to: '/docs/getting-started' },
      { get label() { return m["nav.docs"]() }, to: '/docs' },
      { get label() { return m["nav.about"]() }, to: '/about' },
      { get label() { return m["verify.meta_title"]() }, to: '/verify' },
      { get label() { return m["track.meta_title"]() }, to: '/track' },
      { get label() { return m["nav.sign_in"]() }, to: '/login' },
    ],
  },
] as const

export default function Footer() {
  const year = new Date().getFullYear()

  return (
    <footer className="border-t border-border/40 bg-muted/35">
      <section className="container flex w-full flex-col gap-10 py-14 md:max-w-6xl">
        <div className="grid grid-cols-2 gap-8 md:grid-cols-[1.2fr_1fr_1fr_1.2fr]">
          <div className="col-span-2 flex flex-col gap-3 md:col-span-1">
            <Link to="/" className="flex items-center gap-2 text-xl font-semibold tracking-tight">
              <img src="/favicon.svg" alt="" className="size-8" />
              Pleadli
            </Link>
            <p className="text-sm text-muted-foreground">{m["polish.footer"]()}</p>
          </div>

          {columns.map((column) => (
            <nav key={column.title} className="flex flex-col gap-2">
              <span className="mb-2 text-xs font-semibold text-foreground">{column.title}</span>
              {column.links.map((item) => (
                <Link key={item.to} to={item.to} className="text-xs leading-relaxed text-muted-foreground transition-colors hover:text-foreground">
                  {item.label}
                </Link>
              ))}
            </nav>
          ))}

          <div className="flex flex-col gap-2">
            <Link to="/contact" className="mb-2 text-xs font-semibold text-foreground">{m["nav.contact"]()}</Link>
            <a href={`mailto:${CONTACT.email}`} className="text-xs leading-relaxed text-muted-foreground transition-colors hover:text-foreground">{CONTACT.email}</a>
            <a href={`tel:${CONTACT.phoneE164}`} className="text-xs leading-relaxed text-muted-foreground transition-colors hover:text-foreground">{CONTACT.phone}</a>
            <span className="text-sm text-muted-foreground">{CONTACT.person}</span>
          </div>
        </div>

        <p className="border-t border-border/55 pt-6 text-sm text-muted-foreground">
          &copy; {year} Pleadli. {m["site.rights"]()}
        </p>
      </section>
    </footer>
  )
}
