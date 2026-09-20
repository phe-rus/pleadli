import { AddRecordPanel } from '@/components/add-record-panel'
import { useHqConfig, usePermissions } from '@/features/session'
import { AddCircleIcon, CommandIcon, Home01Icon, Settings01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Button } from '@pleadli/ui/button'
import { cn } from '@pleadli/ui/lib/utils'
import { useLocation, useNavigate } from '@tanstack/react-router'
import { useWorkspace } from './tabs-store'

function RibbonButton({
  icon,
  label,
  onClick,
  active = false,
}: {
  icon: typeof Home01Icon
  label: string
  onClick: () => void
  active?: boolean
}) {
  return (
    <Button
      size="icon"
      variant="ghost"
      onClick={onClick}
      aria-label={label}
      title={label}
      // @ts-ignore
      variant={active ? 'secondary' : 'ghost'}
      className={cn('cursor-pointer')}
    >
      <HugeiconsIcon icon={icon} />
    </Button>
  )
}

/** The ribbon: one narrow rail of icon actions that stays visible even when
 * the left sidebar is closed (Obsidian's own ribbon keeps quick actions
 * reachable the same way). Grouped by role — the frequent working actions
 * on top, the app-level switchers at the foot — so the same action is never
 * in two places at once. */
export function Ribbon() {
  const navigate = useNavigate()
  const location = useLocation()
  const { setCommandOpen, openTab } = useWorkspace()
  const { data: hqConfig } = useHqConfig()
  const { can, session } = usePermissions()
  const canAddRecords = !hqConfig?.isHeadOffice && (!session || can('prisoner.read'))

  return (
    <div className="flex w-11 shrink-0 flex-col items-center gap-1 border-r border-border/20 bg-background py-1.5">
      <RibbonButton
        icon={Home01Icon}
        label="Today"
        active={location.pathname === '/'}
        onClick={() => {
          openTab({ key: 'today', kind: 'today', title: 'Today', to: '/', closable: false })
          void navigate({ to: '/' })
        }}
      />
      {canAddRecords && (
        <AddRecordPanel
          trigger={
            <Button size="icon" variant="ghost" aria-label="Add a record" title="Add a record" className="cursor-pointer">
              <HugeiconsIcon icon={AddCircleIcon} />
            </Button>
          }
        />
      )}

      <div className="flex-1" />

      <span className="my-1 h-px w-5 bg-border/40" aria-hidden />
      <RibbonButton icon={CommandIcon} label="Search and commands (Ctrl K)" onClick={() => setCommandOpen(true)} />
      <RibbonButton icon={Settings01Icon} label="Settings" onClick={() => void navigate({ to: '/settings' })} />
    </div>
  )
}