import { Button } from '@pleadli/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@pleadli/ui/popover'
import { docsNav } from '@/data/docs'
import { ArrowDown01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { createFileRoute, Link, Outlet, useLocation } from '@tanstack/react-router'
import { cn } from '@pleadli/ui/lib/utils'
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
      "container mx-auto flex w-full flex-col gap-8 py-12 md:py-16",
      'md:max-w-6xl md:flex-row md:items-start',
      'relative'
    )}>
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
                activeProps={{ className: 'bg-background font-medium text-primary shadow-sm' }}
                activeOptions={{ exact: true }}
              >
                {item.title}
              </Link>
            ))}
          </PopoverContent>
        </Popover>
      </div>

      <nav className={cn(
        'hidden md:sticky md:top-24 md:flex md:w-52 md:shrink-0',
        'md:flex-col md:border-l md:border-border/60',
      )}>
        {docsNav.map((item) => (
          <Link
            key={item.to}
            to={item.to}
            className={cn(
              '-ml-px border-l-2 border-transparent px-4 py-2 text-sm',
              'text-muted-foreground transition-colors hover:text-foreground',
            )}
            activeProps={{ className: 'border-primary font-medium text-foreground' }}
            activeOptions={{ exact: true }}
          >
            {item.title}
          </Link>
        ))}
      </nav>

      <div className={cn(
        'guide-reading min-w-0 flex-1 md:max-w-3xl',
        'leading-relaxed',
      )}>
        <Outlet />
      </div>
    </article>
  )
}
