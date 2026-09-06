import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { docsNav } from '@/data/docs'
import { ArrowDown01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { createFileRoute, Link, Outlet, useLocation } from '@tanstack/react-router'
import { cn } from 'cn'
import { useState } from 'react'

export const Route = createFileRoute('/_public/docs')({
  component: RouteComponent,
})

function RouteComponent() {
  const location = useLocation()
  const [open, setOpen] = useState(false)
  const current = docsNav.find((item) => item.to === location.pathname) ?? docsNav[0]

  return (
    <article className={cn(
      "container mx-auto flex w-full flex-col gap-5 py-10",
      'md:max-w-5xl md:flex-row md:items-start',
      'relative'
    )}>
      {/* Mobile: a popover listing the docs pages */}
      <div className="md:hidden">
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger
            render={
              <Button
                variant="outline"
                className="sticky top-10 w-full justify-between"
              />
            }
          >
            {current.title}
            <HugeiconsIcon icon={ArrowDown01Icon} />
          </PopoverTrigger>
          <PopoverContent align="start" className="w-(--anchor-width) gap-0">
            {docsNav.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                onClick={() => setOpen(false)}
                className="px-2 text-sm text-muted-foreground hover:text-foreground"
                activeProps={{ className: 'font-medium text-foreground' }}
                activeOptions={{ exact: true }}
              >
                {item.title}
              </Link>
            ))}
          </PopoverContent>
        </Popover>
      </div>

      {/* Desktop: sticky sidebar */}
      <nav className="hidden md:sticky md:top-16 md:flex md:w-48 md:shrink-0 md:flex-col">
        {docsNav.map((item) => (
          <Link
            key={item.to}
            to={item.to}
            className="text-sm text-muted-foreground hover:text-foreground"
            activeProps={{ className: 'font-medium text-foreground' }}
            activeOptions={{ exact: true }}
          >
            {item.title}
          </Link>
        ))}
      </nav>

      <div className="min-w-0 flex-1">
        <Outlet />
      </div>
    </article>
  )
}
