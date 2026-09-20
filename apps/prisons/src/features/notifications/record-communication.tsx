import { AreaField, TextField } from '@/components/form-fields'
import { ApiError } from '@/lib/api'
import { Button } from '@pleadli/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@pleadli/ui/dialog'
import { t } from '@pleadli/ui/goey-toaster'
import { useState } from 'react'
import { useRecordCommunication } from './queries'
import { m } from '@/paraglide/messages'

/** For an official communication that arrived on paper, by phone or in person:
 * the same inbox item as one that arrives over a connection, so the facility
 * works the same with or without one. */
export function RecordCommunication({ open, onOpenChange, onRecorded }: { open: boolean; onOpenChange: (open: boolean) => void; onRecorded: (id: string) => void }) {
  const record = useRecordCommunication()
  const [source, setSource] = useState('')
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form
          className="flex flex-col gap-4"
          onSubmit={async (event) => {
            event.preventDefault()
            try {
              const id = await record.mutateAsync({ source, subject, body: body.trim() || null, relatedPrisonerId: null })
              t.success(m.notifications_recorded_in_the_inbox())
              setSource('')
              setSubject('')
              setBody('')
              onOpenChange(false)
              onRecorded(id)
            } catch (error) {
              t.error(m.notifications_could_not_record_it(), { description: error instanceof ApiError ? error.message : m.notifications_please_try_again() })
            }
          }}
        >
          <DialogHeader>
            <DialogTitle>{m.notifications_record_a_communication()}</DialogTitle>
            <DialogDescription>{m.notifications_for_an_official_communication_received_o()}</DialogDescription>
          </DialogHeader>
          <TextField label={m.notifications_from()} value={source} onChange={setSource} autoFocus placeholder={m.notifications_for_example_high_court_kampala()} />
          <TextField label={m.notifications_about()} value={subject} onChange={setSubject} placeholder={m.notifications_for_example_production_order_for_3()} />
          <AreaField label={m.notifications_note()} value={body} onChange={setBody} description={m.notifications_optional_reference_numbers_what_was_aske()} />
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              {m.notifications_cancel()}
            </Button>
            <Button type="submit" disabled={!source.trim() || !subject.trim() || record.isPending}>
              {m.notifications_record_it()}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
