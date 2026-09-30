import { messageOf } from '@/lib/api'
import { Button } from '@pleadli/ui/button'
import { t } from '@pleadli/ui/goey-toaster'
import { isRichTextEmpty, RichTextInput, RichTextPreview } from '@pleadli/rich-text'
import { format } from 'date-fns/format'
import { useState } from 'react'
import type { MatterNote } from '../matters/schema'
import { useAddNote, useRemoveNote, useUpdateNote } from './queries'

/** Writing a note on a matter. Headings and lists are in the toolbar, same as
 * a filed document; a note is not typically as formal, but an instruction or
 * an interview record is often long enough to need structure. */
export function NoteComposer({ matterId }: { matterId: string }) {
  const add = useAddNote()
  const [body, setBody] = useState('')
  const submit = () => {
    if (isRichTextEmpty(body) || add.isPending) return
    add.mutate({ matterId, body }, { onSuccess: () => setBody(''), onError: (error) => t.error('Could not add the note', { description: messageOf(error) }) })
  }
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border bg-card p-3">
      <RichTextInput
        value={body}
        editorClassName="min-h-24"
        placeholder="An instruction, an interview, a point to remember."
        onChange={setBody}
      />
      <div className="flex items-center justify-end gap-3">
        <Button size="sm" onClick={submit} disabled={isRichTextEmpty(body) || add.isPending}>
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
            <RichTextInput value={body} editorClassName="min-h-32" onChange={setBody} />
            <div className="flex gap-2">
              <Button
                size="sm"
                disabled={isRichTextEmpty(body) || update.isPending}
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
          <RichTextPreview value={note.body} />
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
