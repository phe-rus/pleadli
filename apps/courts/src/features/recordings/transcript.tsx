import { Tag } from '@/components/status-tag'
import { messageOf } from '@/lib/api'
import { noteKinds } from '@/features/sitting-record'
import { Button } from '@pleadli/ui/button'
import { t } from '@pleadli/ui/goey-toaster'
import { Input } from '@pleadli/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@pleadli/ui/select'
import { Textarea } from '@pleadli/ui/textarea'
import { useState } from 'react'
import { useAddSegment, useAdoptSegment, useRemoveSegment, useSegments, useTranscribe, useTranscriptionStatus, useUpdateSegment } from './queries'
import { clock, parseClock, segmentStateLabels, type Recording, type Segment } from './schema'

const stateTone = { draft: 'urgent', edited: 'open', adopted: 'done' } as const

function SegmentRow({ segment, editable, onSeek }: { segment: Segment; editable: boolean; onSeek: (ms: number) => void }) {
  const update = useUpdateSegment()
  const remove = useRemoveSegment()
  const adopt = useAdoptSegment()
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState(segment.text)
  const [kind, setKind] = useState('evidence')
  const adopted = segment.state === 'adopted'

  return (
    <div role="listitem" className="flex flex-col gap-1 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="ghost" onClick={() => onSeek(segment.startMs)} aria-label={`Play from ${clock(segment.startMs)}`}>
          {clock(segment.startMs)}
        </Button>
        <Tag tone={stateTone[segment.state]}>{segmentStateLabels[segment.state]}</Tag>
        {segment.speaker && <strong>{segment.speaker}</strong>}
      </div>
      {editing ? (
        <div className="flex flex-col gap-2">
          <Textarea value={text} rows={3} onChange={(e) => setText(e.target.value)} aria-label="Correct the passage" />
          <div className="flex gap-2">
            <Button
              size="sm"
              disabled={!text.trim() || update.isPending}
              onClick={() =>
                update.mutate(
                  { id: segment.id, input: { startMs: segment.startMs, endMs: segment.endMs, speaker: segment.speaker, channel: segment.channel, text } },
                  { onSuccess: () => setEditing(false), onError: (error) => t.error('Could not save the passage', { description: messageOf(error) }) },
                )
              }
            >
              Save
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <p className="whitespace-pre-wrap">{segment.text}</p>
      )}
      {!adopted && !editing && editable && (
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
            Correct
          </Button>
          <Button size="sm" variant="ghost" onClick={() => remove.mutate(segment.id, { onError: (error) => t.error('Could not remove it', { description: messageOf(error) }) })}>
            Remove
          </Button>
          {segment.state === 'edited' && (
            <>
              <div className="w-36">
                <Select items={noteKinds.map((k) => ({ value: k.id, label: k.label }))} value={kind} onValueChange={(v) => setKind(v ?? 'evidence')}>
                  <SelectTrigger aria-label="Kind of note to make">
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
              <Button
                size="sm"
                variant="secondary"
                onClick={() => adopt.mutate({ id: segment.id, kind }, { onSuccess: () => t.success('Taken into the bench record'), onError: (error) => t.error('Could not adopt it', { description: messageOf(error) }) })}
              >
                Adopt into the record
              </Button>
            </>
          )}
        </div>
      )}
    </div>
  )
}

/** The transcript of one recording. It is an aid: a passage is a machine draft,
 * edited by a person, or adopted into the bench record as a note. With no
 * transcription engine, a person types passages against the recording; this says
 * so plainly and never fills the page with invented text. */
export function Transcript({ recording, editable, onSeek }: { recording: Recording; editable: boolean; onSeek: (ms: number) => void }) {
  const { data: segments } = useSegments(recording.id)
  const { data: engine } = useTranscriptionStatus()
  const transcribe = useTranscribe()
  const add = useAddSegment()
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [speaker, setSpeaker] = useState('')
  const [text, setText] = useState('')

  const submit = () => {
    const startMs = parseClock(start)
    const endMs = parseClock(end) ?? startMs
    if (startMs == null || endMs == null) {
      t.error('Give the time as minutes and seconds, for example 12:31')
      return
    }
    add.mutate(
      { recordingId: recording.id, input: { startMs, endMs, speaker: speaker.trim() || null, channel: null, text } },
      {
        onSuccess: () => {
          setText('')
          setStart(end || start)
          setEnd('')
        },
        onError: (error) => t.error('Could not add the passage', { description: messageOf(error) }),
      },
    )
  }

  return (
    <div className="mb-3 flex flex-col gap-3 rounded-lg border border-border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-muted-foreground">{engine && !engine.available ? engine.reason : 'A transcript is a draft, never the record.'}</p>
        <Button
          size="sm"
          variant="secondary"
          disabled={transcribe.isPending || !engine?.available}
          title={engine && !engine.available ? engine.reason : undefined}
          onClick={() => transcribe.mutate(recording.id, { onError: (error) => t.error('Transcription is not available', { description: messageOf(error) }) })}
        >
          Transcribe
        </Button>
      </div>

      {segments && segments.length > 0 ? (
        <div role="list" className="flex flex-col divide-y divide-border/60 border-y border-border/60">
          {segments.map((s) => (
            <SegmentRow key={s.id} segment={s} editable={editable} onSeek={onSeek} />
          ))}
        </div>
      ) : (
        <p className="text-muted-foreground">No passage has been written for this recording.</p>
      )}

      {editable && (
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap gap-2">
            <Input className="w-24" value={start} onChange={(e) => setStart(e.target.value)} placeholder="From 12:31" aria-label="From (minutes and seconds)" />
            <Input className="w-24" value={end} onChange={(e) => setEnd(e.target.value)} placeholder="To 12:58" aria-label="To (minutes and seconds)" />
            <Input className="min-w-40 flex-1" value={speaker} onChange={(e) => setSpeaker(e.target.value)} placeholder="Who is speaking (optional)" aria-label="Speaker" />
          </div>
          <Textarea value={text} rows={2} onChange={(e) => setText(e.target.value)} placeholder="What was said, as you hear it on the recording." aria-label="Passage" />
          <div>
            <Button size="sm" disabled={!text.trim() || !start.trim() || add.isPending} onClick={submit}>
              Add passage
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
