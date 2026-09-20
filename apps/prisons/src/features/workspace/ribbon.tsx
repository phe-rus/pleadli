import { AiMagicIcon, Home01Icon, Search01Icon, Settings01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Button } from '@pleadli/ui/button'
import { useLocation, useNavigate } from '@tanstack/react-router'
import { useHqConfig, usePermissions } from '@/features/session'
import { InboxBell } from '@/features/notifications'
import { QuickActions } from './quick-actions'
import { useWorkspace } from './tabs-store'
import { m } from '@/paraglide/messages'

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

/** The ribbon: one narrow rail against the window edge that stays put when
 * the sidebar is folded away, so the fastest actions are always one click
 * off. Today first, then finding things, starting things, the inbox and the
 * assistant; settings sit at the foot. */
export function Ribbon() {
  const navigate = useNavigate()
  const pathname = useLocation({ select: (location) => location.pathname })
  const { setCommandOpen, rightOpen, rightMode, toggleRight } = useWorkspace()
  const { data: hqConfig } = useHqConfig()
  const { can, session } = usePermissions()
  const canSearch = !session || can('prisoner.read') || can('hq.locate')

  return (
    <nav aria-label={m.shell_ribbon()} className="flex w-11 print:hidden shrink-0 flex-col items-center gap-1 border-r border-border/20 bg-background py-1.5">
      <RibbonButton icon={Home01Icon} label={hqConfig?.isHeadOffice ? m.shell_overview() : m.shell_today()} active={pathname === '/'} onClick={() => void navigate({ to: '/' })} />
      {canSearch && <RibbonButton icon={Search01Icon} label={m.shell_search_commands()} onClick={() => setCommandOpen(true)} />}
      <QuickActions />
      <InboxBell />
      <RibbonButton icon={AiMagicIcon} label={m.shell_assistant()} active={rightOpen && rightMode === 'assistant'} onClick={() => toggleRight('assistant')} />

      <div className="flex-1" />

      <RibbonButton icon={Settings01Icon} label={m.shell_settings()} active={pathname.startsWith('/settings')} onClick={() => void navigate({ to: '/settings' })} />
    </nav>
  )
}
