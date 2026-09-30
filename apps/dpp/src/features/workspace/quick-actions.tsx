import { Createpanel } from '@/components/create-panel'
import { PersonForm } from '@/features/people'
import { ProsecutionFileForm } from '@/features/prosecution-files'
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
import * as m from '@/paraglide/messages'

type Panel = 'file' | 'person' | null

/** The ribbon's second control: what a prosecutor most often needs to start.
 * Finding something, then opening a file or adding a person. Not a navigation
 * menu: the areas live in the sidebar. A new file opens its own workspace once
 * it is saved. */
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
            <Button size="icon" variant="ghost" aria-label={m["workspace.quick.label"]()} title={m["workspace.quick.label"]()} className="cursor-pointer">
              <HugeiconsIcon icon={AddCircleIcon} />
            </Button>
          }
        />
        <DropdownMenuContent side="right" align="start" sideOffset={8} className="w-60">
          <DropdownMenuGroup>
            <DropdownMenuLabel>{m["workspace.quick.find"]()}</DropdownMenuLabel>
            <DropdownMenuItem onClick={() => setCommandOpen(true)}>
              <HugeiconsIcon icon={Search01Icon} />
              {m["nav.item.search"]()}
              <DropdownMenuShortcut>Ctrl K</DropdownMenuShortcut>
            </DropdownMenuItem>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            <DropdownMenuLabel>{m["workspace.quick.start"]()}</DropdownMenuLabel>
            <DropdownMenuItem onClick={() => setPanel('file')}>
              <HugeiconsIcon icon={FolderViewIcon} />
              {m["workspace.quick.open_file"]()}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setPanel('person')}>
              <HugeiconsIcon icon={UserGroupIcon} />
              {m["workspace.quick.add_person"]()}
            </DropdownMenuItem>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>

      <Createpanel
        open={panel === 'file'}
        onOpenChange={(open) => !open && close()}
        isDirty={dirty}
        headings={{ title: m["workspace.quick.open_file"](), description: m["workspace.quick.open_file_description"]() }}
      >
        <ProsecutionFileForm
          onDirtyChange={setDirty}
          onSuccess={(file) => {
            close()
            void navigate({ to: '/files/$fileId', params: { fileId: file.id } })
          }}
        />
      </Createpanel>
      <Createpanel
        open={panel === 'person'}
        onOpenChange={(open) => !open && close()}
        isDirty={dirty}
        headings={{ title: m["workspace.quick.add_person"](), description: m["workspace.quick.add_person_description"]() }}
      >
        <PersonForm onDirtyChange={setDirty} onSuccess={close} />
      </Createpanel>
    </>
  )
}
