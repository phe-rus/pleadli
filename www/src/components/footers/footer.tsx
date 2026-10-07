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
      { get label() { return m["nav.sign_in"]() }, to: '/login' },
    ],
  },
] as const

export default function Footer() {
  const year = new Date().getFullYear()

  return (
    <footer className="border-t border-border/55 bg-background">
      <section className="container flex w-full flex-col gap-12 py-16 md:max-w-5xl">
        <div className="grid grid-cols-2 gap-10 md:grid-cols-4">
          <div className="col-span-2 flex flex-col gap-3 md:col-span-1">
            <Link to="/" className="flex items-center gap-2 text-base font-bold">
              <img src="/favicon.svg" alt="" className="size-6" />
              Pleadli
            </Link>
            <p className="text-sm text-muted-foreground">{m["site.slogan"]()}</p>
          </div>

          {columns.map((column) => (
            <nav key={column.title} className="flex flex-col gap-2">
              <span className="text-sm font-medium text-foreground">{column.title}</span>
              {column.links.map((item) => (
                <Link key={item.to} to={item.to} className="text-sm text-muted-foreground hover:text-foreground">
                  {item.label}
                </Link>
              ))}
            </nav>
          ))}

          <div className="flex flex-col gap-2">
            <Link to="/contact" className="text-sm font-medium text-foreground">{m["nav.contact"]()}</Link>
            <a href={`mailto:${CONTACT.email}`} className="text-sm text-muted-foreground hover:text-foreground">{CONTACT.email}</a>
            <a href={`tel:${CONTACT.phoneE164}`} className="text-sm text-muted-foreground hover:text-foreground">{CONTACT.phone}</a>
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
