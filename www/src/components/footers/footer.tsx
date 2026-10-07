import * as m from '@/paraglide/messages'
import { Link } from '@tanstack/react-router'

const footerNav = [
  { get label() { return m["nav.overview"]() }, to: '/' },
  { get label() { return m["nav.products"]() }, to: '/products' },
  { get label() { return m["nav.roadmap"]() }, to: '/roadmap' },
  { get label() { return m["nav.downloads"]() }, to: '/downloads' },
  { get label() { return m["nav.docs"]() }, to: '/docs' },
  { get label() { return m["nav.about"]() }, to: '/about' },
] as const

export default function Footer() {
  const year = new Date().getFullYear()

  return (
    <footer className="border-t border-border/55 bg-background">
      <section className="container flex w-full flex-col gap-10 py-20 md:max-w-5xl">
        <div className="flex flex-col items-start justify-between gap-6 sm:flex-row sm:items-center">
          <Link to="/" className="flex items-center gap-2 text-base font-bold">
            <img src="/favicon.svg" alt="" className="size-5" />
            Pleadli
          </Link>

          <nav className="flex flex-wrap items-center gap-x-6 gap-y-2">
            {footerNav.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                className="text-sm text-muted-foreground hover:text-foreground"
              >
                {item.label}
              </Link>
            ))}
            <Link to="/login" className="text-sm text-muted-foreground hover:text-foreground">
              {m["nav.sign_in"]()}
            </Link>
          </nav>
        </div>

        <div className="flex max-w-sm flex-col gap-1">
          <p className="text-sm font-medium text-foreground">{m["site.slogan"]()}</p>
          <p className="text-sm text-muted-foreground">{m["site.motto"]()}</p>
        </div>

        <p className="border-t border-border/55 pt-6 text-sm text-muted-foreground">
          &copy; {year} Pleadli. {m["site.rights"]()}
        </p>
      </section>
    </footer>
  )
}
