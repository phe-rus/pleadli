import { messageOf } from '@/lib/api'
import { Button } from '@pleadli/ui/button'
import { t } from '@pleadli/ui/goey-toaster'
import { Textarea } from '@pleadli/ui/textarea'
import { format } from 'date-fns/format'
import { useState } from 'react'
import type { MatterNote } from '../matters/schema'
import { useAddNote, useRemoveNote, useUpdateNote } from './queries'

/** Writing a note on a matter. Ctrl Enter adds it. */
export function NoteComposer({ matterId }: { matterId: string }) {
  const add = useAddNote()
  const [body, setBody] = useState('')
  const submit = () => {
    if (!body.trim() || add.isPending) return
    add.mutate({ matterId, body }, { onSuccess: () => setBody(''), onError: (error) => t.error('Could not add the note', { description: messageOf(error) }) })
  }
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border bg-card p-3">
      <Textarea
        value={body}
        rows={3}
        onChange={(e) => setBody(e.target.value)}
        onKeyDown={(e) => {
          if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
            e.preventDefault()
            submit()
          }
        }}
        placeholder="An instruction, an interview, a point to remember."
        aria-label="Note"
      />
      <div className="flex items-center justify-between gap-3">
        <p className="text-muted-foreground">Ctrl Enter adds it.</p>
        <Button size="sm" onClick={submit} disabled={!body.trim() || add.isPending}>
          Add note
        </Button>
      </div>
    </div>
  )
}

export function NoteRow({ note, editable }: { note: MatterNote; editable: boolean }) {
  const update = useUpdateNote()
  const remove = useRemoveNote()
  const [editing, setEditing] = useState(false)
  const [body, setBody] = useState(note.body)

  return (
    <div role="listitem" className="flex gap-3 py-3">
      <p className="w-36 shrink-0 tabular-nums text-muted-foreground">{format(note.at, 'd MMM yyyy, HH:mm')}</p>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        {editing ? (
          <div className="flex flex-col gap-2">
            <Textarea value={body} rows={4} onChange={(e) => setBody(e.target.value)} aria-label="Edit the note" />
            <div className="flex gap-2">
              <Button
                size="sm"
                disabled={!body.trim() || update.isPending}
                onClick={() => update.mutate({ id: note.id, body }, { onSuccess: () => setEditing(false), onError: (error) => t.error('Could not save the note', { description: messageOf(error) }) })}
              >
                Save
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setBody(note.body)
                  setEditing(false)
                }}
              >
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <p className="whitespace-pre-wrap">{note.body}</p>
        )}
      </div>
      {editable && !editing && (
        <div className="flex shrink-0 items-start gap-1">
          <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
            Edit
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              if (!window.confirm('Remove this note?')) return
              remove.mutate(note.id, { onError: (error) => t.error('Could not remove the note', { description: messageOf(error) }) })
            }}
          >
            Remove
          </Button>
        </div>
      )}
    </div>
  )
}
