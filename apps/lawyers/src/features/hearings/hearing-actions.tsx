import { Createpanel } from '@/components/create-panel'
import { MoreHorizontalIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Button } from '@pleadli/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@pleadli/ui/dropdown-menu'
import { useState } from 'react'
import { AdjournForm, AttendForm, CancelForm, HearingForm, MissForm, type HearingLike } from './hearing-forms'

type Panel = 'attend' | 'adjourn' | 'move' | 'miss' | 'cancel' | null

const headings: Record<Exclude<Panel, null>, { title: string; description: string }> = {
  attend: { title: 'Mark attended', description: 'You were at the hearing. Record what was done.' },
  adjourn: { title: 'Adjourn', description: 'Record why the hearing did not go ahead, and the next date if the court fixed one.' },
  move: { title: 'Move the hearing', description: 'Change the date, time or purpose of a hearing that has not yet been attended.' },
  miss: { title: 'Record as missed', description: 'You were not at the hearing. It is recorded as it is.' },
  cancel: { title: 'Cancel the hearing', description: 'The hearing will not be held and is taken off the diary.' },
}

/** What can be done to a hearing still to come: mark it attended, adjourn it, move
 * it, or record that it was missed or cancelled. A closed hearing is a record and
 * has no actions. */
export function HearingActions({ hearing, matterId, adjournDefaults }: { hearing: HearingLike; matterId: string; adjournDefaults?: { reason: string; responsible: string } }) {
  const [panel, setPanel] = useState<Panel>(null)
  const [dirty, setDirty] = useState(false)
  const close = () => {
    setPanel(null)
    setDirty(false)
  }

  return (
    <>
      <Button size="sm" variant="secondary" onClick={() => setPanel('attend')}>
        Attended
      </Button>
      <Button size="sm" variant="secondary" onClick={() => setPanel('adjourn')}>
        Adjourned
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button size="icon-sm" variant="ghost" aria-label="More actions for this hearing" title="More" className="cursor-pointer print:hidden">
              <HugeiconsIcon icon={MoreHorizontalIcon} />
            </Button>
          }
        />
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => setPanel('move')}>Move</DropdownMenuItem>
          <DropdownMenuItem onClick={() => setPanel('miss')}>Record as missed</DropdownMenuItem>
          <DropdownMenuItem onClick={() => setPanel('cancel')}>Cancel hearing</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Createpanel open={panel != null} onOpenChange={(open) => !open && close()} isDirty={dirty} headings={headings[panel ?? 'attend']}>
        {panel === 'attend' && <AttendForm hearingId={hearing.id} onSuccess={close} onDirtyChange={setDirty} />}
        {panel === 'adjourn' && <AdjournForm hearing={hearing} defaults={adjournDefaults} onSuccess={close} onDirtyChange={setDirty} />}
        {panel === 'move' && <HearingForm matterId={matterId} existing={hearing} onSuccess={close} onDirtyChange={setDirty} />}
        {panel === 'miss' && <MissForm hearingId={hearing.id} onSuccess={close} onDirtyChange={setDirty} />}
        {panel === 'cancel' && <CancelForm hearingId={hearing.id} onSuccess={close} onDirtyChange={setDirty} />}
      </Createpanel>
    </>
  )
}
