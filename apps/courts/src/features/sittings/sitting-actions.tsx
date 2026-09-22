import { Createpanel } from '@/components/create-panel'
import { MoreHorizontalIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Button } from '@pleadli/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@pleadli/ui/dropdown-menu'
import { useState } from 'react'
import { AdjournForm, CancelForm, HoldForm, SittingForm, type SittingLike } from './sitting-forms'

type Panel = 'hold' | 'adjourn' | 'move' | 'cancel' | null

const headings: Record<Exclude<Panel, null>, { title: string; description: string }> = {
  hold: { title: 'Close as held', description: 'The sitting took place. Record what was done.' },
  adjourn: { title: 'Adjourn', description: 'Record why the sitting did not go ahead, and the next date if the court fixed one.' },
  move: { title: 'Move the sitting', description: 'Change the date, time or purpose of a sitting that has not yet been held.' },
  cancel: { title: 'Cancel the sitting', description: 'The sitting will not be held and is taken off the cause list.' },
}

/** What can be done to a sitting still to come: close it as held, adjourn it,
 * move it or cancel it. A closed sitting is a record and has no actions. */
export function SittingActions({ sitting, caseId, adjournDefaults }: { sitting: SittingLike; caseId: string; adjournDefaults?: { reason: string; responsible: string } }) {
  const [panel, setPanel] = useState<Panel>(null)
  const [dirty, setDirty] = useState(false)
  const close = () => {
    setPanel(null)
    setDirty(false)
  }

  return (
    <>
      <Button size="sm" variant="secondary" onClick={() => setPanel('hold')}>
        Held
      </Button>
      <Button size="sm" variant="secondary" onClick={() => setPanel('adjourn')}>
        Adjourn
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button size="icon-sm" variant="ghost" aria-label="More actions for this sitting" title="More" className="cursor-pointer print:hidden">
              <HugeiconsIcon icon={MoreHorizontalIcon} />
            </Button>
          }
        />
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => setPanel('move')}>Move</DropdownMenuItem>
          <DropdownMenuItem onClick={() => setPanel('cancel')}>Cancel sitting</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Createpanel open={panel != null} onOpenChange={(open) => !open && close()} isDirty={dirty} headings={headings[panel ?? 'hold']}>
        {panel === 'hold' && <HoldForm sittingId={sitting.id} onSuccess={close} onDirtyChange={setDirty} />}
        {panel === 'adjourn' && <AdjournForm sitting={sitting} defaults={adjournDefaults} onSuccess={close} onDirtyChange={setDirty} />}
        {panel === 'move' && <SittingForm caseId={caseId} existing={sitting} onSuccess={close} onDirtyChange={setDirty} />}
        {panel === 'cancel' && <CancelForm sittingId={sitting.id} onSuccess={close} onDirtyChange={setDirty} />}
      </Createpanel>
    </>
  )
}
