import { authClient } from '@/auth/client'
import { LanguageSwitch } from '@/components/language-switch'
import { IS_DEV } from '@/lib/site'
import { ArrowDown01Icon, Logout03Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon, type IconSvgElement } from '@hugeicons/react'
import { cn } from '@pleadli/ui/lib/utils'
import { Link } from '@tanstack/react-router'
import { useCallback, useEffect, useState, type ReactNode } from 'react'

export type ShellItem = {
  to: string
  label: string
  icon: IconSvgElement
  exact?: boolean
  /** Things waiting for the person here. Quiet grey; red only when `urgent`. */
  count?: number
  urgent?: boolean
}

/** One titled group of places. A group without a title sits above the rest. */
export type ShellGroup = { id: string; title?: string; items: readonly ShellItem[] }

const row = cn(
  'flex h-9 w-full min-w-0 items-center gap-2.5 rounded-lg px-2.5 text-[0.8125rem] outline-none md:h-7.5',
  'text-sidebar-foreground transition-colors duration-150 hover:bg-foreground/5',
  'focus-visible:ring-2 focus-visible:ring-ring/50 motion-reduce:transition-none',
)

/** The sidebar button as a Mac draws it, the same one the desktop apps use. */
function PaneIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 16" className={cn('h-4 w-5 fill-none stroke-current stroke-[1.3]', className)} aria-hidden>
      <rect x="1.65" y="1.65" width="16.7" height="12.7" rx="2.6" />
      <path d="M7.25 1.8v12.4" />
      <path d="M3.6 5h1.8M3.6 7.4h1.8M3.6 9.8h1.8" strokeLinecap="round" />
    </svg>
  )
}

const iconButton = cn(
  'flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted-foreground outline-none',
  'hover:bg-foreground/[0.06] hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 md:size-7',
)

function Place({ item }: { item: ShellItem }) {
  return (
    <Link
      to={item.to}
      activeOptions={{ exact: item.exact }}
      activeProps={{ className: 'bg-primary/12 font-medium text-foreground [&_svg]:text-primary' }}
      className={row}
    >
      <HugeiconsIcon icon={item.icon} className="size-4 shrink-0 text-muted-foreground" />
      <span className="min-w-0 flex-1 truncate">{item.label}</span>
      {item.count ? (
        <span
          className={cn(
            'shrink-0 text-xs tabular-nums',
            item.urgent ? 'rounded-full bg-destructive px-1.5 leading-4 font-semibold text-white' : 'text-muted-foreground',
          )}
        >
          {item.count > 99 ? '99+' : item.count}
        </span>
      ) : null}
    </Link>
  )
}

/** One folding group, titled the way the desktop apps title theirs: small and
 * quiet, with the fold arrow only when the pointer is near. */
function Group({ group }: { group: ShellGroup }) {
  const [open, setOpen] = useState(true)
  const places = (
    <div className="flex flex-col gap-px pt-0.5">
      {group.items.map((item) => <Place key={item.to} item={item} />)}
    </div>
  )
  if (!group.title) return <div className="pt-1">{places}</div>
  return (
    <section className="group/section flex flex-col pt-3">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={`group-${group.id}`}
        onClick={() => setOpen((v) => !v)}
        className="flex h-6 w-full cursor-pointer items-center justify-between rounded-md px-2.5 text-left text-[0.6875rem] font-semibold text-muted-foreground/80 outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
      >
        {group.title}
        <HugeiconsIcon
          icon={ArrowDown01Icon}
          className={cn('size-3.5 shrink-0 opacity-0 transition duration-150 group-hover/section:opacity-100 motion-reduce:transition-none', !open && '-rotate-90 opacity-100')}
        />
      </button>
      <div id={`group-${group.id}`} className={cn('grid transition-[grid-template-rows] duration-200 ease-out motion-reduce:transition-none', open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]')}>
        <div inert={!open} className="min-h-0 overflow-hidden">{places}</div>
      </div>
    </section>
  )
}

/** The one frame around every signed-in page on pleadli.com: Pleadli Account
 * for institutions and Pleadli Admin for staff. It follows the desktop apps'
 * sidebar: full height on its own quiet grey, small folding group titles, a
 * soft tinted pill for the place you are in, and who you are at the foot.
 * Each area passes its own brand, groups and words; the rest lives here once. */
export function CloudShell({
  brand,
  groups,
  identity,
  signedInAs,
  links,
  signOutLabel,
  openMenuLabel,
  closeMenuLabel,
  banner,
  children,
}: {
  brand: { to: string; label: string; icon: IconSvgElement }
  groups: readonly ShellGroup[]
  /** A small line under the brand, such as an institution's address. */
  identity?: ReactNode
  /** The signed-in email, shown at the foot beside its avatar. */
  signedInAs?: string
  /** Quiet links above the foot (switch institution, the other area, the website). */
  links?: { to: string; label: string }[]
  signOutLabel: string
  openMenuLabel: string
  closeMenuLabel: string
  banner?: ReactNode
  children: ReactNode
}) {
  const [pending, setPending] = useState(false)
  const [open, setOpen] = useState(true)
  const signOut = useCallback(() => {
    setPending(true)
    void authClient.signOut({ fetchOptions: { onSuccess: () => { window.location.href = '/' } } })
  }, [])

  // Beside the page on a laptop; closed over it on a phone.
  useEffect(() => {
    setOpen(window.matchMedia('(min-width: 768px)').matches)
  }, [])

  const initials = (signedInAs ?? '?').slice(0, 2).toUpperCase()
  const toggleLabel = open ? closeMenuLabel : openMenuLabel

  return (
    <div className="fixed inset-0 flex overflow-hidden bg-background">
      {open && <div aria-hidden className="fixed inset-0 z-40 bg-foreground/20 md:hidden" onClick={() => setOpen(false)} />}

      <aside
        aria-label={brand.label}
        inert={!open}
        onClick={(e) => {
          if (window.matchMedia('(max-width: 767px)').matches && (e.target as HTMLElement).closest('a')) setOpen(false)
        }}
        className={cn(
          'fixed inset-y-0 start-0 z-50 flex w-64 shrink-0 flex-col bg-sidebar transition-[transform,margin] duration-200 ease-out motion-reduce:transition-none',
          'md:static md:z-auto',
          open ? 'translate-x-0 border-e border-sidebar-border' : '-translate-x-full md:-ms-64',
        )}
      >
        <div className="flex h-12 shrink-0 items-center justify-end px-3">
          <button type="button" className={iconButton} aria-label={closeMenuLabel} title={closeMenuLabel} onClick={() => setOpen(false)}>
            <PaneIcon />
          </button>
        </div>

        <div className="flex flex-col gap-2 px-4 pb-3">
          <Link to={brand.to} className="flex min-w-0 items-center gap-2.5 text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/50">
            <span aria-hidden className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-primary/12 text-primary">
              <HugeiconsIcon icon={brand.icon} className="size-4" />
            </span>
            <span className="min-w-0 truncate text-[0.9375rem] font-semibold">{brand.label}</span>
          </Link>
          {identity}
        </div>

        <nav className="no-scrollbar flex min-h-0 flex-1 flex-col overflow-y-auto px-2 pb-3">
          {groups.map((g) => <Group key={g.id} group={g} />)}
        </nav>

        <div className="flex flex-col gap-1 border-t border-sidebar-border px-2 py-2">
          {links?.map((l) => (
            <Link key={l.to} to={l.to} className={cn(row, 'text-muted-foreground hover:text-foreground')}>
              <span className="truncate">{l.label}</span>
            </Link>
          ))}
          <span className="flex min-w-0 items-center gap-2 px-1.5 pt-1">
            <span aria-hidden className="flex size-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-b from-primary/80 to-primary text-[0.6875rem] font-semibold text-primary-foreground">
              {initials}
            </span>
            <span className="truncate text-[0.8125rem] text-foreground" title={signedInAs}>{signedInAs}</span>
          </span>
          <div className="flex items-center justify-between gap-1">
            <LanguageSwitch className="h-8 px-1.5 text-xs md:h-7" />
            <button
              type="button"
              onClick={signOut}
              disabled={pending}
              className="flex h-8 cursor-pointer items-center gap-1.5 rounded-md px-2 text-[0.8125rem] font-medium text-destructive outline-none hover:bg-destructive/10 focus-visible:ring-2 focus-visible:ring-destructive/40 disabled:opacity-60 md:h-7"
            >
              <HugeiconsIcon icon={Logout03Icon} className="size-4" />
              {signOutLabel}
            </button>
          </div>
        </div>
      </aside>

      <div className="relative flex min-w-0 flex-1 flex-col">
        {IS_DEV && (
          <div className="border-b border-primary/30 bg-primary/15 px-4 py-1 text-center text-xs font-medium text-foreground">
            Development copy: local database, not pleadli.com
          </div>
        )}
        {banner}
        {!open && (
          <div className="flex h-12 shrink-0 items-center gap-2 px-3">
            <button type="button" className={iconButton} aria-label={toggleLabel} title={toggleLabel} onClick={() => setOpen(true)}>
              <PaneIcon />
            </button>
            <span className="min-w-0 truncate text-sm font-semibold md:hidden">{brand.label}</span>
          </div>
        )}
        <div className="no-scrollbar flex-1 overflow-y-auto">{children}</div>
      </div>
    </div>
  )
}
