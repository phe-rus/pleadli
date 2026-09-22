import { Createpanel } from '@/components/create-panel'
import { CaseForm } from '@/features/cases'
import { AddCircleIcon, FolderViewIcon, Search01Icon } from '@hugeicons/core-free-icons'
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

/** The ribbon's second control: what the bench most often needs to start.
 * Finding a case, then registering one. Not a navigation menu: the areas live in
 * the sidebar. A new case opens its own workspace once it is saved. */
export function QuickActions() {
  const navigate = useNavigate()
  const { setCommandOpen } = useWorkspace()
  const [open, setOpen] = useState(false)
  const [dirty, setDirty] = useState(false)
  const close = () => {
    setOpen(false)
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
            <DropdownMenuItem onClick={() => setOpen(true)}>
              <HugeiconsIcon icon={FolderViewIcon} />
              Register a case
            </DropdownMenuItem>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>

      <Createpanel open={open} onOpenChange={(next) => !next && close()} isDirty={dirty} headings={{ title: 'Register a case', description: 'Record a criminal case the court registry has numbered.' }}>
        <CaseForm
          onDirtyChange={setDirty}
          onSuccess={(record) => {
            close()
            void navigate({ to: '/cases/$caseId', params: { caseId: record.id } })
          }}
        />
      </Createpanel>
    </>
  )
}
