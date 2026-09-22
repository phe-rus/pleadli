import { messageOf } from '@/lib/api'
import { Button } from '@pleadli/ui/button'
import { t } from '@pleadli/ui/goey-toaster'
import { Input } from '@pleadli/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@pleadli/ui/select'
import { Textarea } from '@pleadli/ui/textarea'
import { useState } from 'react'
import { useAddNote } from './queries'
import { noteKinds } from './schema'

/** Writing a note as the sitting runs. Each note is stamped with the moment it
 * is added, so a recording can be lined up against it later. Ctrl Enter adds. */
export function NoteComposer({ sittingId }: { sittingId: string }) {
  const add = useAddNote()
  const [kind, setKind] = useState('note')
  const [speaker, setSpeaker] = useState('')
  const [body, setBody] = useState('')

  const submit = () => {
    if (!body.trim() || add.isPending) return
    add.mutate(
      { sittingId, input: { kind, speaker: speaker.trim() || null, body } },
      {
        onSuccess: () => setBody(''),
        onError: (error) => t.error('Could not add the note', { description: messageOf(error) }),
      },
    )
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border bg-card p-3">
      <div className="flex flex-wrap gap-2">
        <div className="w-40">
          <Select items={noteKinds.map((k) => ({ value: k.id, label: k.label }))} value={kind} onValueChange={(v) => setKind(v ?? 'note')}>
            <SelectTrigger aria-label="Kind of note">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {noteKinds.map((k) => (
                <SelectItem key={k.id} value={k.id}>
                  {k.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Input className="min-w-40 flex-1" value={speaker} onChange={(e) => setSpeaker(e.target.value)} placeholder="Who is speaking (optional)" aria-label="Speaker" />
      </div>
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
        placeholder="Write the note. Evidence is taken down as a narrative."
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
