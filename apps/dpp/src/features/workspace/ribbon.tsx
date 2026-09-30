import { Home01Icon, Logout03Icon, Search01Icon, Settings01Icon, SparklesIcon } from '@hugeicons/core-free-icons'
import { setAssistOpen, useAssistOpen } from '@/features/assist/dock'
import { lockNow, useSecurityStatus } from '@/features/security'
import { useQueryClient } from '@tanstack/react-query'
import { HugeiconsIcon } from '@hugeicons/react'
import { Button } from '@pleadli/ui/button'
import { useLocation, useNavigate } from '@tanstack/react-router'
import { QuickActions } from './quick-actions'
import { useWorkspace } from './tabs-store'
import * as m from '@/paraglide/messages'

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
  const assistOpen = useAssistOpen()

  return (
    <nav aria-label={m["workspace.ribbon"]()} className="flex w-11 shrink-0 flex-col items-center gap-1 border-r border-border/20 bg-background py-1.5 print:hidden">
      <RibbonButton icon={Home01Icon} label={m["nav.item.overview"]()} active={pathname === '/'} onClick={() => void navigate({ to: '/' })} />
      <RibbonButton icon={Search01Icon} label={m["workspace.search_shortcut"]()} onClick={() => setCommandOpen(true)} />
      <QuickActions />
      <RibbonButton icon={SparklesIcon} label={m["assist.title"]()} active={assistOpen} onClick={() => setAssistOpen((o) => !o)} />

      <div className="flex-1" />

      {security?.configured && <RibbonButton icon={Logout03Icon} label={m["workspace.sign_out"]()} onClick={() => void lockNow().then(() => queryClient.invalidateQueries({ queryKey: ['security'] }))} />}

      <RibbonButton icon={Settings01Icon} label={m["nav.item.settings"]()} active={pathname.startsWith('/settings')} onClick={() => void navigate({ to: '/settings' })} />
    </nav>
  )
}
