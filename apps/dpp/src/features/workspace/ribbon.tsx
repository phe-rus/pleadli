import { Home01Icon, Search01Icon, Settings01Icon, SquareLock02Icon } from '@hugeicons/core-free-icons'
import { lockNow, useSecurityStatus } from '@/features/security'
import { useQueryClient } from '@tanstack/react-query'
import { HugeiconsIcon } from '@hugeicons/react'
import { Button } from '@pleadli/ui/button'
import { useLocation, useNavigate } from '@tanstack/react-router'
import { QuickActions } from './quick-actions'
import { useWorkspace } from './tabs-store'

function RibbonButton({ icon, label, onClick, active = false }: { icon: typeof Home01Icon; label: string; onClick: () => void; active?: boolean }) {
  return (
    <Button
      size="icon"
      variant={active ? 'secondary' : 'ghost'}
      onClick={onClick}
      aria-label={label}
      aria-current={active ? 'page' : undefined}
      title={label}
      className="cursor-pointer"
    >
      <HugeiconsIcon icon={icon} />
    </Button>
  )
}

/** The ribbon: one narrow rail against the window edge that stays put when the
 * sidebar is folded away, so the fastest actions are always one click off.
 * Overview first, then finding things and starting things; settings sit at the
 * foot. */
export function Ribbon() {
  const navigate = useNavigate()
  const pathname = useLocation({ select: (location) => location.pathname })
  const { setCommandOpen } = useWorkspace()
  const { data: security } = useSecurityStatus()
  const queryClient = useQueryClient()

  return (
    <nav aria-label="Ribbon" className="flex w-11 shrink-0 flex-col items-center gap-1 border-r border-border/20 bg-background py-1.5 print:hidden">
      <RibbonButton icon={Home01Icon} label="Overview" active={pathname === '/'} onClick={() => void navigate({ to: '/' })} />
      <RibbonButton icon={Search01Icon} label="Search (Ctrl K)" onClick={() => setCommandOpen(true)} />
      <QuickActions />

      <div className="flex-1" />

      {security?.configured && <RibbonButton icon={SquareLock02Icon} label="Lock now" onClick={() => void lockNow().then(() => queryClient.invalidateQueries({ queryKey: ['security'] }))} />}

      <RibbonButton icon={Settings01Icon} label="Settings" active={pathname.startsWith('/settings')} onClick={() => void navigate({ to: '/settings' })} />
    </nav>
  )
}
