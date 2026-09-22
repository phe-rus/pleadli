import { Createpanel } from '@/components/create-panel'
import { CaseForm } from '@/features/cases'
import { CustodyRecordForm } from '@/features/custody'
import { IncidentForm } from '@/features/incidents'
import { PersonForm } from '@/features/people'
import { StationDiaryEntryForm } from '@/features/station-diary'
import { AddCircleIcon, BinocularsIcon, CellsIcon, Notebook01Icon, Search01Icon, SirenIcon, UserGroupIcon } from '@hugeicons/core-free-icons'
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
import { Suspense, useState, type ReactNode } from 'react'
import { useWorkspace } from './tabs-store'

type Panel = 'diary' | 'incident' | 'case' | 'custody' | 'person' | null

const panels: Record<Exclude<Panel, null>, { title: string; description: string }> = {
  diary: { title: 'Station diary entry', description: 'Record what has been reported or done at the station.' },
  incident: { title: 'Record an incident', description: 'An occurrence reported to or found by the station.' },
  case: { title: 'Open a case', description: 'Start a new case file.' },
  custody: { title: 'Record custody', description: 'Someone taken into custody. The 48 hour clock starts from the arrest.' },
  person: { title: 'Add a person', description: 'Someone who appears in the station records.' },
}

/** The ribbon's second control: what an officer most often needs to start.
 * Finding something, then the records that begin work. Not a navigation menu:
 * the areas live in the sidebar. A new case opens its own workspace once it is
 * saved. */
export function QuickActions() {
  const navigate = useNavigate()
  const { setCommandOpen } = useWorkspace()
  const [panel, setPanel] = useState<Panel>(null)
  const [dirty, setDirty] = useState(false)
  const close = () => {
    setPanel(null)
    setDirty(false)
  }

  const forms: Record<Exclude<Panel, null>, ReactNode> = {
    diary: <StationDiaryEntryForm onDirtyChange={setDirty} onSuccess={close} />,
    incident: <IncidentForm onDirtyChange={setDirty} onSuccess={close} />,
    case: (
      <CaseForm
        onDirtyChange={setDirty}
        onSuccess={(created) => {
          close()
          void navigate({ to: '/investigations/$caseId', params: { caseId: created.id } })
        }}
      />
    ),
    custody: <CustodyRecordForm onDirtyChange={setDirty} onSuccess={close} />,
    person: <PersonForm onSuccess={close} />,
  }

  const item = (key: Exclude<Panel, null>, icon: typeof AddCircleIcon, label: string) => (
    <DropdownMenuItem onClick={() => setPanel(key)}>
      <HugeiconsIcon icon={icon} />
      {label}
    </DropdownMenuItem>
  )

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
            {item('diary', Notebook01Icon, 'Station diary entry')}
            {item('incident', SirenIcon, 'Record an incident')}
            {item('case', BinocularsIcon, 'Open a case')}
            {item('custody', CellsIcon, 'Record custody')}
            {item('person', UserGroupIcon, 'Add a person')}
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>

      {(Object.keys(panels) as Exclude<Panel, null>[]).map((key) => (
        <Createpanel key={key} open={panel === key} onOpenChange={(open) => !open && close()} isDirty={dirty} headings={panels[key]}>
          {panel === key && <Suspense fallback={<p className="p-4 text-muted-foreground">Loading</p>}>{forms[key]}</Suspense>}
        </Createpanel>
      ))}
    </>
  )
}
