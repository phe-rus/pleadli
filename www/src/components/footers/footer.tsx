import { Link } from '@tanstack/react-router'

const footerNav = [
  { label: 'Overview', to: '/' },
  { label: 'About', to: '/about' },
  { label: 'Docs', to: '/docs' },
] as const

export default function Footer() {
  const year = new Date().getFullYear()

  return (
    <footer className="border-t border-border/55 bg-background">
      <section className="container flex w-full flex-col gap-10 py-20 md:max-w-5xl">
        <div className="flex flex-col items-start justify-between gap-6 sm:flex-row sm:items-center">
          <Link to="/" className="flex items-center gap-2 text-base font-bold">
            <img src="/tauri.svg" alt="" className="size-5" />
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
              Sign in
            </Link>
          </nav>
        </div>

        <p className="max-w-sm text-sm text-muted-foreground">
          One case. Every institution keeps its own record.
        </p>

        <p className="border-t border-border/55 pt-6 text-sm text-muted-foreground">
          &copy; {year} Pleadli. All rights reserved.
        </p>
      </section>
    </footer>
  )
}
