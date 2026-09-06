import { PersonStandingIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Link } from '@tanstack/react-router'
import { useMemo } from 'react'
import { Button } from '../ui/button'

export default function Header() {
  const itemsList = useMemo(() => {
    return [
      { label: 'Home', to: '/' },
      { label: 'About', to: '/about' },
      { label: 'Docs', to: '/docs' },
    ]
  }, [])

  return (
    <header className="sticky top-0 z-40 border-b border-border/15 bg-background/95 backdrop-blur">
      <section className="px-5 flex h-12 items-center justify-between gap-5">
        <div className="flex items-center gap-5">
          <Link to="/" className="flex items-center gap-2 font-bold text-base shrink-0">
            <img src="/tauri.svg" alt="" className="size-5" />
            Pleadli
          </Link>

          <nav className="hidden md:flex items-center gap-2">
            {itemsList?.map((items, index) => {
              return (
                <Link
                  key={index}
                  to={items.to}
                  className='text-base'
                  activeProps={{ className: 'text-primary' }}
                >
                  {items.label}
                </Link>
              )
            })}
          </nav>
        </div>

        <nav className='flex items-center gap-2'>
          <Button
            size='sm'
            variant='secondary'
          >
            <HugeiconsIcon icon={PersonStandingIcon} />
            Get started for free
          </Button>
        </nav>
      </section>
    </header>
  )
}
