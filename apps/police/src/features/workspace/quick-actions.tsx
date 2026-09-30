import * as m from '@/paraglide/messages'
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

// A function, not a table, so the headings are read in the current language.
const panels = (): Record<Exclude<Panel, null>, { title: string; description: string }> => ({
  diary: { title: m["quick.diary_title"](), description: m["quick.diary_desc"]() },
  incident: { title: m["quick.incident_title"](), description: m["quick.incident_desc"]() },
  case: { title: m["quick.case_title"](), description: m["quick.case_desc"]() },
  custody: { title: m["quick.custody_title"](), description: m["quick.custody_desc"]() },
  person: { title: m["quick.person_title"](), description: m["quick.person_desc"]() },
})

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
            <Button size="icon" variant="ghost" aria-label={m["workspace.quick_actions"]()} title={m["workspace.quick_actions"]()} className="cursor-pointer">
              <HugeiconsIcon icon={AddCircleIcon} />
            </Button>
          }
        />
        <DropdownMenuContent side="right" align="start" sideOffset={8} className="w-60">
          <DropdownMenuGroup>
            <DropdownMenuLabel>{m["workspace.find"]()}</DropdownMenuLabel>
            <DropdownMenuItem onClick={() => setCommandOpen(true)}>
              <HugeiconsIcon icon={Search01Icon} />
              {m["workspace.search"]()}
              <DropdownMenuShortcut>{m["workspace.shortcut_k"]()}</DropdownMenuShortcut>
            </DropdownMenuItem>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            <DropdownMenuLabel>{m["workspace.start"]()}</DropdownMenuLabel>
            {item('diary', Notebook01Icon, m["quick.diary_title"]())}
            {item('incident', SirenIcon, m["quick.incident_title"]())}
            {item('case', BinocularsIcon, m["quick.case_title"]())}
            {item('custody', CellsIcon, m["quick.custody_title"]())}
            {item('person', UserGroupIcon, m["quick.person_title"]())}
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>

      {(Object.entries(panels()) as [Exclude<Panel, null>, { title: string; description: string }][]).map(([key, headings]) => (
        <Createpanel key={key} open={panel === key} onOpenChange={(open) => !open && close()} isDirty={dirty} headings={headings}>
          {panel === key && <Suspense fallback={<p className="p-4 text-muted-foreground">{m["workspace.loading"]()}</p>}>{forms[key]}</Suspense>}
        </Createpanel>
      ))}
    </>
  )
}
