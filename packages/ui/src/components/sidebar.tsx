import { ChevronLeftIcon, ChevronRightIcon } from '@hugeicons/core-free-icons'
import type { IconSvgElement } from '@hugeicons/react'
import { HugeiconsIcon } from '@hugeicons/react'
import { Link } from '@tanstack/react-router'
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type FC,
  type PropsWithChildren,
  type ReactNode,
} from 'react'
import { useIsMobile } from '../hooks/use-media-query'
import { cn } from '../lib/utils'
import { Button } from './button'

export interface SidebarNavItem {
  to: string
  label: string
  icon: IconSvgElement
  exact?: boolean
}

export interface SidebarBrand {
  to: string
  label: string
  icon: IconSvgElement
}

type SidebarContextValue = {
  open: boolean
  setOpen: (open: boolean) => void
}
const SidebarContext = createContext<SidebarContextValue | null>(null)

export interface DashboardProps extends PropsWithChildren {
  brand: SidebarBrand
  nav: readonly SidebarNavItem[]
  footer?: ReactNode
  banner?: ReactNode
}

export const Dashboard: FC<DashboardProps> = ({ brand, nav, footer, banner, children }) => {
  const [open, setOpen] = useState<boolean>(true)
  const [isPeeking, setIsPeeking] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const isMobile = useIsMobile()

  const toggleSidebar = useCallback(() => {
    setOpen((prev) => !prev)
    setIsPeeking(false)
  }, [])

  useEffect(() => {
    if (!isMobile) {
      setOpen(true)
    }
  }, [isMobile])

  const isExpanded = open || isPeeking

  return (
    <SidebarContext.Provider
      value={{
        open: open,
        setOpen: toggleSidebar,
      }}
    >
      <div className="fixed inset-0 overflow-hidden">
        <main className="relative flex h-svh w-full overflow-hidden">
          {open && (
            <div
              className={cn('fixed inset-0 backdrop-blur-sm', 'z-30 backdrop-blur-xs md:hidden')}
              onClick={toggleSidebar}
            />
          )}
          <aside
            ref={ref}
            onMouseEnter={() => {
              if (!open && !isMobile) setIsPeeking(true)
            }}
            onMouseLeave={() => setIsPeeking(false)}
            className={cn(
              'fixed h-full shrink-0 border-r bg-muted/15 shadow-md',
              'border-border/15 inset-y-0 z-55 backdrop-blur-3xl',
              'transition-all duration-300 ease-in-out ease-initial',
              'will-change-transform will-change-backdrop-filter',
              'shadow shadow-muted',
              open
                ? 'w-72 translate-x-0 z-55 md:relative'
                : isPeeking
                  ? 'w-72 translate-x-0 z-55 md:absolute shadow-2xl'
                  : 'w-72 -translate-x-full z-10 md:absolute',
            )}
          >
            <Button
              size={open ? 'icon-xs' : 'icon-sm'}
              variant="secondary"
              aria-label={isExpanded ? 'Collapse sidebar' : 'Expand sidebar'}
              className={cn(
                'absolute top-5 z-56 -translate-y-1/2 cursor-pointer',
                'rounded-full transition-all duration-300 select-none',
                !isExpanded && 'flex',
                isExpanded ? 'left-full -translate-x-1/2' : 'left-[calc(100%+8px)] translate-x-0.5',
              )}
              onClick={() => toggleSidebar()}
            >
              {!isExpanded ? (
                <HugeiconsIcon icon={ChevronRightIcon} />
              ) : (
                <HugeiconsIcon icon={ChevronLeftIcon} />
              )}
            </Button>
            <section
              className={cn('min-h-svh flex-col gap-5 px-5 py-2', !isExpanded ? 'hidden' : 'flex')}
            >
              <section className="flex flex-col gap-2">
                <nav className="flex items-center gap-1">
                  <Link
                    to={brand.to}
                    className={cn(
                      'flex gap-1.5 items-center text-primary',
                      'hover:text-primary/65 tracking-wider font-bold',
                      'px-1',
                    )}
                  >
                    <HugeiconsIcon icon={brand.icon} className="size-4.5" />
                    {brand.label}
                  </Link>
                </nav>
                <nav className="flex flex-col gap-px">
                  {nav.map((item) => (
                    <Link
                      key={item.to}
                      to={item.to}
                      className={cn(
                        'group relative flex items-center gap-2 text-base',
                        'transition-colors duration-150 ease-out',
                        'px-1 rounded-md hover:bg-secondary',
                      )}
                      activeProps={{ className: 'text-primary font-bold bg-secondary' }}
                      activeOptions={{ exact: item.exact }}
                    >
                      <HugeiconsIcon icon={item.icon} className="size-4.5" />
                      {item.label}
                    </Link>
                  ))}
                </nav>
              </section>
              <span className="flex-1" />
              {footer && (
                <nav className={cn('sticky bottom-0 mb-auto', 'flex flex-col gap-3')}>{footer}</nav>
              )}
            </section>
          </aside>
          <div className="relative no-scrollbar flex flex-1 flex-col overflow-y-auto">
            {banner}
            {children}
          </div>
        </main>
      </div>
    </SidebarContext.Provider>
  )
}

export function useSidebar() {
  const context = useContext(SidebarContext)
  if (!context) {
    throw new Error('useSidebar must be used within Dashboard')
  }
  return context
}
