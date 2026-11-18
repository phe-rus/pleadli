import { ArrowDown01Icon, Download01Icon, Menu01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { buttonVariants } from '@pleadli/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@pleadli/ui/popover'
import { Link } from '@tanstack/react-router'
import { cn } from '@pleadli/ui/lib/utils'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useEffect, useRef, useState } from 'react'
import { LanguageSwitch } from '@/components/language-switch'
import { LinkArrow } from '@/components/link-arrow'
import { getProducts } from '@/data/products'
import * as m from '@/paraglide/messages'

type MenuId = 'products' | 'resources'

const item = { hidden: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0, transition: { duration: 0.22, ease: [0.22, 1, 0.36, 1] as const } } }

const resources = () => [
  { label: m['nav.docs'](), to: '/docs' },
  { label: m['nav.getting_started'](), to: '/docs/getting-started' },
  { label: m['nav.roadmap'](), to: '/roadmap' },
  { label: m['verify.meta_title'](), to: '/verify' },
  { label: m['track.meta_title'](), to: '/track' },
  { label: m['nav.about'](), to: '/about' },
] as const

const plainLinks = () => [
  { label: m['nav.pricing'](), to: '/licensing' },
  { label: m['nav.contact'](), to: '/contact' },
] as const

const linkStyle = cn(
  'inline-flex h-14 items-center gap-1 px-3 text-sm text-foreground/75',
  'transition-colors hover:text-foreground',
)

export default function Header({ signedIn = false, staff = false }: { signedIn?: boolean; staff?: boolean }) {
  const [menu, setMenu] = useState<MenuId | null>(null)
  const [mobileOpen, setMobileOpen] = useState(false)
  const closeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const reduce = useReducedMotion()
  const products = getProducts()

  const show = (id: MenuId) => {
    clearTimeout(closeTimer.current)
    setMenu(id)
  }
  const hideSoon = () => {
    clearTimeout(closeTimer.current)
    closeTimer.current = setTimeout(() => setMenu(null), 140)
  }

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setMenu(null) }
    window.addEventListener('keydown', onKey)
    return () => { window.removeEventListener('keydown', onKey); clearTimeout(closeTimer.current) }
  }, [])

  const trigger = (id: MenuId, label: string) => (
    <button
      type="button"
      aria-expanded={menu === id}
      aria-haspopup="true"
      onMouseEnter={() => show(id)}
      onFocus={() => show(id)}
      onClick={() => show(id)}
      className={cn(linkStyle, menu === id && 'text-foreground')}
    >
      {label}
      <HugeiconsIcon icon={ArrowDown01Icon} className={cn('size-3.5! transition-transform', menu === id && 'rotate-180')} />
    </button>
  )

  return (
    <div className="sticky top-0 z-50 h-14" onMouseLeave={hideSoon} onMouseEnter={() => clearTimeout(closeTimer.current)}>
    <header className={cn('absolute inset-x-0 top-0 border-b border-border/60 bg-background', menu ? 'shadow-lg' : 'shadow-xs')}>
      <div className={cn('container flex h-14 w-full items-center justify-between', 'gap-4 md:max-w-6xl')}>
        <div className="flex items-center gap-6">
          <Link to="/" onClick={() => setMenu(null)} className={cn('flex shrink-0 items-center gap-2', 'text-lg font-semibold tracking-tight')}>
            <img src="/logo.svg" alt="" className="size-8" />
            Pleadli
          </Link>
          <nav className="hidden items-center lg:flex" aria-label="Primary">
            {trigger('products', m['nav.products']())}
            {trigger('resources', m['footer.learn']())}
            {plainLinks().map((item) => (
              <Link key={item.to} to={item.to} onMouseEnter={() => setMenu(null)} className={linkStyle} activeProps={{ className: 'text-foreground' }}>
                {item.label}
              </Link>
            ))}
          </nav>
        </div>

        <div className="flex items-center gap-1.5">
          <LanguageSwitch />
          {signedIn ? (
            <>
              {staff && <Link to="/admin" className={cn(linkStyle, 'hidden h-9 sm:inline-flex')}>{m['nav.admin']()}</Link>}
              <Link to="/account" className={cn(linkStyle, 'hidden h-9 sm:inline-flex')}>{m['nav.dashboard']()}</Link>
            </>
          ) : (
            <Link to="/login" className={cn(linkStyle, 'hidden h-9 sm:inline-flex')}>{m['nav.sign_in']()}</Link>
          )}
          <Link to="/downloads" className={cn(buttonVariants({ size: 'sm' }), 'rounded-md text-sm')}>
            <HugeiconsIcon icon={Download01Icon} data-icon="inline-start" />
            {m['nav.downloads']()}
          </Link>

          <Popover open={mobileOpen} onOpenChange={setMobileOpen}>
            <PopoverTrigger
              render={
                <button
                  type="button"
                  aria-label={m['nav.open_menu']()}
                  className={cn(
                    'flex size-9 shrink-0 items-center justify-center rounded-md',
                    'text-foreground/75 hover:text-foreground lg:hidden',
                  )}
                />
              }
            >
              <HugeiconsIcon icon={Menu01Icon} className="size-5!" />
            </PopoverTrigger>
            <PopoverContent align="end" className="max-h-[80vh] w-64 gap-0.5 overflow-y-auto p-2 lg:hidden">
              <span className="px-2 pb-1 pt-2 text-xs font-medium text-muted-foreground">{m['nav.products']()}</span>
              {products.map((product) => (
                <Link key={product.slug} to="/products/$slug" params={{ slug: product.slug }} onClick={() => setMobileOpen(false)} className="rounded-md px-2 py-1.5 text-sm hover:bg-muted">
                  {product.name}
                </Link>
              ))}
              <span className="px-2 pb-1 pt-3 text-xs font-medium text-muted-foreground">{m['footer.learn']()}</span>
              {[...resources(), ...plainLinks()].map((item) => (
                <Link key={item.to} to={item.to} onClick={() => setMobileOpen(false)} className="rounded-md px-2 py-1.5 text-sm hover:bg-muted">
                  {item.label}
                </Link>
              ))}
              {signedIn ? (
                <>
                  <Link to="/account" onClick={() => setMobileOpen(false)} className="rounded-md px-2 py-1.5 text-sm font-medium hover:bg-muted">{m['nav.dashboard']()}</Link>
                  {staff && <Link to="/admin" onClick={() => setMobileOpen(false)} className="rounded-md px-2 py-1.5 text-sm hover:bg-muted">{m['nav.admin']()}</Link>}
                </>
              ) : (
                <Link to="/login" onClick={() => setMobileOpen(false)} className="rounded-md px-2 py-1.5 text-sm hover:bg-muted">{m['nav.sign_in']()}</Link>
              )}
            </PopoverContent>
          </Popover>
        </div>
      </div>

      <AnimatePresence initial={false}>
        {menu && (
          <motion.div
            key="panel"
            initial={reduce ? false : { height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={reduce ? { opacity: 0 } : { height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            className="hidden overflow-hidden lg:block"
          >
            <div className={cn('container w-full', 'md:max-w-6xl')}>
              <AnimatePresence mode="wait" initial={false}>
                <motion.div
                  key={menu}
                  initial={reduce ? false : 'hidden'}
                  animate="show"
                  exit={{ opacity: 0, transition: { duration: 0.08 } }}
                  variants={{ hidden: {}, show: { transition: { staggerChildren: 0.04 } } }}
                  className="grid gap-12 py-9 lg:grid-cols-[minmax(0,4fr)_minmax(0,8fr)]"
                >
                  <motion.div variants={item} className="flex flex-col items-start gap-3">
                    <span className="text-xl font-semibold tracking-tight">{menu === 'products' ? m['nav.products']() : m['footer.learn']()}</span>
                    <p className="max-w-xs text-sm leading-relaxed text-muted-foreground">
                      {menu === 'products' ? m['products.lead']() : m['polish.guide_lead']()}
                    </p>
                    <Link
                      to={menu === 'products' ? '/downloads' : '/docs'}
                      onClick={() => setMenu(null)}
                      className="pt-1 text-sm font-medium text-primary-ink hover:underline"
                    >
                      {menu === 'products' ? m['launch.choose']() : m['nav.docs']()} <LinkArrow />
                    </Link>
                  </motion.div>

                  {menu === 'products' ? (
                    <ul className="m-0 grid list-none grid-cols-2 gap-x-6 gap-y-1 p-0">
                      {products.map((product) => (
                        <motion.li key={product.slug} variants={item} className="list-none">
                          <Link
                            to="/products/$slug"
                            params={{ slug: product.slug }}
                            onClick={() => setMenu(null)}
                            className="flex items-start gap-3 rounded-lg p-3 transition-colors hover:bg-muted"
                          >
                            <span className="grid size-10 shrink-0 place-items-center rounded-lg border border-border/60 bg-muted text-primary-ink">
                              <HugeiconsIcon icon={product.icon} className="size-5!" />
                            </span>
                            <span className="flex flex-col gap-0.5">
                              <span className="text-sm font-semibold">{product.name}</span>
                              <span className="text-sm leading-snug text-muted-foreground">{product.tagline}</span>
                            </span>
                          </Link>
                        </motion.li>
                      ))}
                    </ul>
                  ) : (
                    <ul className="m-0 grid list-none grid-cols-2 gap-x-6 gap-y-1 p-0">
                      {resources().map((entry) => (
                        <motion.li key={entry.to} variants={item} className="list-none">
                          <Link
                            to={entry.to}
                            onClick={() => setMenu(null)}
                            className="flex items-center justify-between rounded-lg p-3 text-sm font-medium transition-colors hover:bg-muted"
                          >
                            {entry.label}
                            <LinkArrow className="text-muted-foreground" />
                          </Link>
                        </motion.li>
                      ))}
                    </ul>
                  )}
                </motion.div>
              </AnimatePresence>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
    </div>
  )
}
