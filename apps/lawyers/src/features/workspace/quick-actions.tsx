import { Createpanel } from '@/components/create-panel'
import { ClientForm } from '@/features/clients'
import { MatterForm } from '@/features/matters'
import { AddCircleIcon, FolderViewIcon, Search01Icon, UserGroupIcon } from '@hugeicons/core-free-icons'
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
import { useWorkspace } from './tabs-store'

type Panel = 'matter' | 'client' | null

/** The ribbon's second control: what an advocate most often needs to start.
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
            <Button size="icon" variant="ghost" aria-label="Quick actions" title="Quick actions" className="cursor-pointer">
              <HugeiconsIcon icon={AddCircleIcon} />
            </Button>
          }
        />
        <DropdownMenuContent side="right" align="start" sideOffset={8} className="w-60">
          <DropdownMenuGroup>
            <DropdownMenuLabel>Find</DropdownMenuLabel>
            <DropdownMenuItem onClick={() => setCommandOpen(true)}>
              <HugeiconsIcon icon={Search01Icon} />
              Search
              <DropdownMenuShortcut>Ctrl K</DropdownMenuShortcut>
            </DropdownMenuItem>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            <DropdownMenuLabel>Start</DropdownMenuLabel>
            <DropdownMenuItem onClick={() => setPanel('matter')}>
              <HugeiconsIcon icon={FolderViewIcon} />
              Open a matter
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setPanel('client')}>
              <HugeiconsIcon icon={UserGroupIcon} />
              Add a client
            </DropdownMenuItem>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>

      <Createpanel
        open={panel === 'matter'}
        onOpenChange={(open) => !open && close()}
        isDirty={dirty}
        headings={{ title: 'Open a matter', description: 'A client, and the matter you are acting in for them.' }}
      >
        <MatterForm
          onDirtyChange={setDirty}
          onSuccess={(matter) => {
            close()
            void navigate({ to: '/matters/$matterId', params: { matterId: matter.id } })
          }}
        />
      </Createpanel>
      <Createpanel open={panel === 'client'} onOpenChange={(open) => !open && close()} isDirty={dirty} headings={{ title: 'Add a client', description: 'Someone you act for.' }}>
        <ClientForm onDirtyChange={setDirty} onSuccess={close} />
      </Createpanel>
    </>
  )
}
