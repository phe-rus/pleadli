import { AddRecordPanel } from '@/components/add-record-panel'
import { useHqConfig, usePermissions } from '@/features/session'
import {
  AddCircleIcon,
  ArrowDataTransferHorizontalIcon,
  DoorOpenIcon,
  Login02Icon,
  MoreHorizontalIcon,
  Search01Icon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Button } from '@pleadli/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from '@pleadli/ui/dropdown-menu'
import { useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { identityForPath } from './tab-identity'
import { useWorkspace } from './tabs-store'
import { m } from '@/paraglide/messages'

/** The first ribbon control: what an officer most often needs to do next,
 * filtered by what they may do and by what is open. Finding something, then
 * starting a procedure, and, when a prisoner's file is in view, the
 * procedures that concern that person. Not a navigation menu: the areas live
 * in the sidebar. */
export function QuickActions() {
  const navigate = useNavigate()
  const { setCommandOpen, tabs, activeKey } = useWorkspace()
  const { data: hqConfig } = useHqConfig()
  const { can, session } = usePermissions()
  const [moreOpen, setMoreOpen] = useState(false)

  const canSearch = !session || can('prisoner.read') || can('hq.locate')
  const canStart = !hqConfig?.isHeadOffice && (!session || can('prisoner.read'))
  const active = tabs.find((tab) => tab.key === activeKey)
  const person = active?.kind === 'prisoner' ? identityForPath(active.to) : null
  const go = (to: string) => void navigate({ to: to as never })

  if (!canSearch && !canStart) return null

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button size="icon" variant="ghost" aria-label={m.workspace_quick_actions()} title={m.workspace_quick_actions()} className="cursor-pointer">
              <HugeiconsIcon icon={AddCircleIcon} />
            </Button>
          }
        />
        <DropdownMenuContent side="right" align="start" sideOffset={8} className="w-60">
          {canSearch && (
            <DropdownMenuGroup>
              <DropdownMenuLabel>{m.workspace_find()}</DropdownMenuLabel>
              <DropdownMenuItem onClick={() => setCommandOpen(true)}>
                <HugeiconsIcon icon={Search01Icon} />
                {m.workspace_search_and_commands()}
                <DropdownMenuShortcut>{m.workspace_ctrl_k()}</DropdownMenuShortcut>
              </DropdownMenuItem>
            </DropdownMenuGroup>
          )}
          {canStart && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                <DropdownMenuLabel>{m.workspace_start()}</DropdownMenuLabel>
                <DropdownMenuItem onClick={() => go('/procedures/reception')}>
                  <HugeiconsIcon icon={Login02Icon} />
                  {m.workspace_receive_someone()}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => go('/procedures/receive')}>
                  <HugeiconsIcon icon={ArrowDataTransferHorizontalIcon} />
                  {m.workspace_receive_a_transfer()}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setMoreOpen(true)}>
                  <HugeiconsIcon icon={MoreHorizontalIcon} />
                  {m.workspace_visit_court_request_more()}
                </DropdownMenuItem>
              </DropdownMenuGroup>
              {person?.kind === 'prisoner' && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuGroup>
                    <DropdownMenuLabel className="truncate">{m.workspace_for({ title: active?.title ?? '' })}</DropdownMenuLabel>
                    <DropdownMenuItem onClick={() => go(`/procedures/discharge/${person.recordId}`)}>
                      <HugeiconsIcon icon={DoorOpenIcon} />
                      {m.workspace_discharge()}
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => go(`/procedures/transfer/${person.recordId}`)}>
                      <HugeiconsIcon icon={ArrowDataTransferHorizontalIcon} />
                      {m.workspace_transfer_out()}
                    </DropdownMenuItem>
                  </DropdownMenuGroup>
                </>
              )}
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      {canStart && <AddRecordPanel open={moreOpen} onOpenChange={setMoreOpen} />}
    </>
  )
}
