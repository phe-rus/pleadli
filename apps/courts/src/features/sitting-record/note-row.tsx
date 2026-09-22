import { Tag } from '@/components/status-tag'
import { messageOf } from '@/lib/api'
import { Button } from '@pleadli/ui/button'
import { t } from '@pleadli/ui/goey-toaster'
import { Textarea } from '@pleadli/ui/textarea'
import { format } from 'date-fns/format'
import { useState } from 'react'
import { useRemoveNote, useUpdateNote } from './queries'
import { noteKindLabel, type BenchNote } from './schema'

/** One note in the record: the time it was written, what kind it is, who spoke,
 * and the text. While the record is unsigned it can be corrected or removed;
 * once signed it is only read. */
export function NoteRow({ note, editable }: { note: BenchNote; editable: boolean }) {
  const update = useUpdateNote()
  const remove = useRemoveNote()
  const [editing, setEditing] = useState(false)
  const [body, setBody] = useState(note.body)

  return (
    <div role="listitem" className="flex gap-3 py-3">
      <p className="w-24 shrink-0 tabular-nums text-muted-foreground">{format(note.at, 'HH:mm:ss')}</p>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <Tag tone={note.kind === 'ruling' || note.kind === 'direction' ? 'open' : 'neutral'}>{noteKindLabel(note.kind)}</Tag>
          {note.speaker && <strong>{note.speaker}</strong>}
        </div>
        {editing ? (
          <div className="flex flex-col gap-2">
            <Textarea value={body} rows={4} onChange={(e) => setBody(e.target.value)} aria-label="Edit the note" />
            <div className="flex gap-2">
              <Button
                size="sm"
                disabled={!body.trim() || update.isPending}
                onClick={() =>
                  update.mutate(
                    { id: note.id, input: { kind: note.kind, speaker: note.speaker, body } },
                    { onSuccess: () => setEditing(false), onError: (error) => t.error('Could not save the note', { description: messageOf(error) }) },
                  )
                }
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
