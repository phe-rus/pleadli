import { Createpanel } from '@/components/create-panel'
import { ClientForm } from '@/features/clients'
import { MatterForm } from '@/features/matters'
import { Add01Icon, FolderViewIcon, Search01Icon, UserGroupIcon } from '@hugeicons/core-free-icons'
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
import { shortcut } from '@/lib/platform'
import * as m from '@/paraglide/messages'
import { useWorkspace } from './tabs-store'

type Panel = 'matter' | 'client' | null

/** The "+" beside search: what an advocate most often needs to start.
 * Finding a matter, then opening one or adding a client. Not a navigation menu:
 * the areas live in the sidebar. */
export function QuickActions() {
  const navigate = useNavigate()
  const { setCommandOpen } = useWorkspace()
  const [panel, setPanel] = useState<Panel>(null)
  const [dirty, setDirty] = useState(false)
  const close = () => {
    setPanel(null)
    setDirty(false)
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button size="icon-sm" variant="ghost" aria-label={m["workspace.quick.label"]()} title={m["workspace.quick.label"]()} className="size-7.5 shrink-0 cursor-pointer rounded-lg">
              <HugeiconsIcon icon={Add01Icon} className="size-4" />
            </Button>
          }
        />
        <DropdownMenuContent side="bottom" align="end" sideOffset={6} className="w-60">
          <DropdownMenuGroup>
            <DropdownMenuLabel>{m["workspace.quick.find"]()}</DropdownMenuLabel>
            <DropdownMenuItem onClick={() => setCommandOpen(true)}>
              <HugeiconsIcon icon={Search01Icon} />
              {m["workspace.search_short"]()}
              <DropdownMenuShortcut>{shortcut('K')}</DropdownMenuShortcut>
            </DropdownMenuItem>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            <DropdownMenuLabel>{m["workspace.quick.start"]()}</DropdownMenuLabel>
            <DropdownMenuItem onClick={() => setPanel('matter')}>
              <HugeiconsIcon icon={FolderViewIcon} />
              {m["matter.open_a_matter"]()}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setPanel('client')}>
              <HugeiconsIcon icon={UserGroupIcon} />
              {m["workspace.quick.add_client"]()}
            </DropdownMenuItem>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>

      <Createpanel
        open={panel === 'matter'}
        onOpenChange={(open) => !open && close()}
        isDirty={dirty}
        headings={{ title: m["matter.open_a_matter"](), description: m["matter.open_a_matter_about"]() }}
      >
        <MatterForm
          onDirtyChange={setDirty}
          onSuccess={(matter) => {
            close()
            void navigate({ to: '/matters/$matterId', params: { matterId: matter.id } })
          }}
        />
      </Createpanel>
      <Createpanel open={panel === 'client'} onOpenChange={(open) => !open && close()} isDirty={dirty} headings={{ title: m["workspace.quick.add_client"](), description: m["workspace.quick.add_client_about"]() }}>
        <ClientForm onDirtyChange={setDirty} onSuccess={close} />
      </Createpanel>
    </>
  )
}
