import { Menu01Icon, PersonStandingIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { buttonVariants } from '@pleadli/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@pleadli/ui/popover'
import { Link, useLocation } from '@tanstack/react-router'
import { cn } from 'cn'
import { useMemo, useState } from 'react'
import { LanguageSwitch } from '@/components/language-switch'
import * as m from '@/paraglide/messages'

const navItems = [
  { get label() { return m["nav.overview"]() }, to: '/' },
  { get label() { return m["nav.products"]() }, to: '/products' },
  { get label() { return m["nav.roadmap"]() }, to: '/roadmap' },
  { get label() { return m["nav.downloads"]() }, to: '/downloads' },
  { get label() { return m["nav.docs"]() }, to: '/docs' },
  { get label() { return m["nav.about"]() }, to: '/about' },
] as const

export default function Header() {
  const location = useLocation()
  const [open, setOpen] = useState(false)
  const itemsList = useMemo(() => navItems, [])

  return (
    <header className="sticky top-0 z-40 border-b border-border/55 bg-background/95 backdrop-blur">
      <section className="px-5 flex h-10 items-center justify-between gap-5">
        <div className="flex items-center gap-5">
          <Link to="/" className="flex items-center gap-2 font-bold text-base shrink-0">
            <img src="/favicon.svg" alt="" className="size-6" />
            Pleadli
          </Link>

          <nav className="hidden md:flex items-center gap-3">
            {itemsList.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                className="text-sm!"
                activeProps={{ className: 'text-primary font-bold' }}
                activeOptions={{ exact: item.to === '/' }}
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>

        <nav className="flex items-center gap-2">
          <LanguageSwitch />
          <Link to="/login" className={cn(buttonVariants({ variant: 'secondary' }))}>
            <HugeiconsIcon icon={PersonStandingIcon} />
            <span className="hidden sm:inline">{m["nav.get_started"]()}</span>
            <span className="sm:hidden">{m["nav.sign_in"]()}</span>
          </Link>

          <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger
              render={
                <button
                  type="button"
                  aria-label={m["nav.open_menu"]()}
                  className="flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground md:hidden"
                />
              }
            >
              <HugeiconsIcon icon={Menu01Icon} className="size-4.5!" />
            </PopoverTrigger>
            <PopoverContent align="end" className="w-48 gap-0.5 p-1.5 md:hidden">
              {itemsList.map((item) => {
                const active = item.to === '/' ? location.pathname === '/' : location.pathname.startsWith(item.to)
                return (
                  <Link
                    key={item.to}
                    to={item.to}
                    onClick={() => setOpen(false)}
                    className={cn(
                      'rounded-md px-2 py-1.5 text-sm text-muted-foreground hover:bg-muted hover:text-foreground',
                      active && 'font-medium text-foreground',
                    )}
                  >
                    {item.label}
                  </Link>
                )
              })}
            </PopoverContent>
          </Popover>
        </nav>
      </section>
    </header>
  )
}
