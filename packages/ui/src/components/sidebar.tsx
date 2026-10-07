import { ChevronDownIcon, ChevronLeftIcon, ChevronRightIcon } from '@hugeicons/core-free-icons'
import type { HugeiconsProps } from '@hugeicons/react'
import { HugeiconsIcon } from '@hugeicons/react'
import { Link } from '@tanstack/react-router'
import {
  createContext,
  Fragment,
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

export type SidebarNavItem = {
  to?: string
  label: string
  icon: HugeiconsProps['icon']
  exact?: boolean
  children?: readonly SidebarNavItem[]
  /** Optional group heading. Items sharing a `section` are rendered under
   * one heading; the first item in a changed section shows the label.
   * Leave unset to keep the flat sidebar most apps use today. */
  section?: string
}

export type SidebarBrand = {
  to: string
  label: string
  icon: HugeiconsProps['icon']
}

type SidebarContextValue = {
  open: boolean
  setOpen: (open: boolean) => void
}
export const SidebarContext = createContext<SidebarContextValue | null>(null)
export function useSidebar() {
  const context = useContext(SidebarContext)
  if (!context) {
    throw new Error('useSidebar must be used within Dashboard')
  }
  return context
}
export type DashboardProps = PropsWithChildren<{
  brand: SidebarBrand
  itemLists: readonly SidebarNavItem[]
  addOns?: {
    enableNavigation?: boolean
    footer?: ReactNode
    banner?: ReactNode
    /** Shown under the brand, before the nav items: the installation's
     * identity (which facility / node this is). */
    identity?: ReactNode
  }
  className?: string
}>

export const Dashboard: FC<DashboardProps> = ({
  addOns = {
    enableNavigation: true
  },
  brand,
  itemLists,
  className,
  children
}) => {
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
              'fixed h-full shrink-0 border-r bg-[color-mix(in_oklab,var(--background)_96%,var(--foreground))]',
              'border-border/60 inset-y-0 z-10',
              'transition-transform duration-300 ease-in-out',
              'will-change-transform',
              open
                ? 'w-64 translate-x-0 z-55 md:relative'
                : isPeeking
                  ? 'w-64 translate-x-0 z-55 md:absolute shadow-2xl'
                  : 'w-64 -translate-x-full z-10 md:absolute',
              className,
            )}
          >
            {addOns.enableNavigation &&
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
            }
            <section
              data-tauri-drag-region
              className={cn(
                'min-h-svh flex-col gap-4 p-3',
                !isExpanded ? 'hidden' : 'flex'
              )}
            >
              <section
                className="flex flex-col gap-2"
              >
                <nav data-tauri-drag-region className="flex items-center gap-1 h-10">
                  <Link
                    to={brand.to}
                    className={cn(
                      'flex min-w-0 items-center gap-2 text-foreground',
                      'px-2 text-[0.9375rem] font-semibold hover:opacity-80',
                    )}
                  >
                    {brand.icon && <HugeiconsIcon icon={brand.icon} className="size-5 shrink-0 text-primary" />}
                    <span className="truncate">{brand.label}</span>
                  </Link>
                </nav>

                {addOns.identity && (
                  <div className="px-2">
                    {addOns.identity}
                  </div>
                )}

                <nav className="flex flex-col gap-0.5">
                  {itemLists.map((item, index) => {
                    const prevItem = itemLists[index - 1]
                    const showSection = Boolean(item.section) && item.section !== prevItem?.section
                    return (
                      <Fragment key={index}>
                        {showSection && (
                          <span className="px-2 pt-3 pb-1 text-xs font-medium text-muted-foreground">
                            {item.section}
                          </span>
                        )}
                        {item.children ? (
                          <div className='flex flex-col gap-1'>
                            <Link to={item.to} className={cn(
                              'group/icon relative flex items-center gap-2 text-base!',
                              'transition-colors duration-150 ease-out py-0.5 px-1',
                              'rounded-md hover:bg-secondary justify-between',
                            )}>
                              <div className='flex items-center gap-2'>
                                {item.icon && <HugeiconsIcon
                                  icon={item.icon}
                                  className="size-5"
                                />}
                                {item.label}
                              </div>

                              <HugeiconsIcon
                                icon={ChevronDownIcon}
                                className='size-5'
                              />
                            </Link>

                            <div className='flex gap-2 pl-3.5 w-full'>
                              <span className='bg-primary w-px' />
                              <div className='flex flex-col w-full'>
                                {item.children.map((child, childIndex) => (
                                  <Link
                                    key={childIndex}
                                    to={child.to}
                                    className={cn(
                                      'group/icon relative flex items-center gap-2 text-base',
                                      'transition-colors duration-150 ease-out py-0.5 px-2',
                                      'rounded-md hover:bg-secondary w-full',
                                    )}
                                    activeProps={{ className: 'text-primary font-medium bg-secondary' }}
                                    activeOptions={{ exact: item.exact }}
                                  >
                                    {child.icon && <HugeiconsIcon
                                      icon={child.icon}
                                      className="size-5"
                                    />}
                                    {child.label}
                                  </Link>
                                ))}
                              </div>
                            </div>
                          </div>
                        ) : (
                          <Link
                            key={index}
                            to={item.to}
                            className={cn(
                              'group/icon relative flex items-center gap-2.5 text-[0.875rem] text-foreground/85',
                              'transition-colors duration-150 ease-out py-1.5 px-2',
                              'rounded-lg hover:bg-foreground/[0.05]',
                            )}
                            activeProps={{ className: 'bg-primary/15 font-medium text-foreground! hover:bg-primary/15 [&_svg]:text-primary' }}
                            activeOptions={{ exact: item.exact }}
                          >
                            {item.icon && <HugeiconsIcon icon={item.icon} className="size-[1.05rem] shrink-0 text-muted-foreground" />}
                            {item.label}
                          </Link>
                        )}
                      </Fragment>
                    )
                  })}
                </nav>
              </section>
              <span
                data-tauri-drag-region
                className="flex-1"
              />
              {addOns.footer && (
                <nav
                  className={cn(
                    'sticky bottom-0 mb-auto',
                    'flex flex-col gap-3'
                  )}
                >
                  {addOns.footer}
                </nav>
              )}
            </section>
          </aside>
          <div className="relative no-scrollbar flex flex-1 flex-col overflow-y-auto">
            {addOns.banner}
            {children}
          </div>
        </main>
      </div>
    </SidebarContext.Provider>
  )
}