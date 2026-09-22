import { Row, RowList } from '@/components/operational-row'
import { EmptyNote } from '@/components/planned'
import { Tag } from '@/components/status-tag'
import { api, messageOf, seg } from '@/lib/api'
import { Button } from '@pleadli/ui/button'
import { t } from '@pleadli/ui/goey-toaster'
import { format } from 'date-fns/format'
import { useRef, useState } from 'react'
import { audioSchema, clock, type Recording } from './schema'
import { useRecordings, useVerifyRecording } from './queries'
import { useRecorder } from './use-recorder'
import { Transcript } from './transcript'

const statusTone = { recording: 'urgent', stopped: 'done', interrupted: 'open' } as const
const statusWords = { recording: 'Recording', stopped: 'Stopped', interrupted: 'Cut short' } as const

function megabytes(bytes: number) {
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function RecordingRow({ recording, transcriptEditable }: { recording: Recording; transcriptEditable: boolean }) {
  const verify = useVerifyRecording()
  const audio = useRef<HTMLAudioElement>(null)
  const [source, setSource] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const [check, setCheck] = useState<{ intact: boolean; reason: string | null; brokenAt: number | null } | null>(null)

  const load = async () => {
    if (source || loading) return
    setLoading(true)
    try {
      const data = audioSchema.parse(await api('GET', `/api/recordings/${seg(recording.id)}/audio`))
      const bytes = Uint8Array.from(atob(data.dataBase64), (c) => c.charCodeAt(0))
      setSource(URL.createObjectURL(new Blob([bytes], { type: data.mimeType })))
    } catch (error) {
      t.error('The audio could not be opened', { description: messageOf(error) })
    } finally {
      setLoading(false)
    }
  }

  const seek = async (ms: number) => {
    await load()
    // The element mounts once the source is set; give it a moment.
    setTimeout(() => {
      if (audio.current) {
        audio.current.currentTime = ms / 1000
        void audio.current.play().catch(() => {})
      }
    }, 150)
  }

  return (
    <div className="flex flex-col">
      <Row
        aligned
        marker={recording.status === 'recording' ? 'urgent' : undefined}
        title={`${format(recording.startedAt, 'PPp')}, ${clock(recording.durationMs)} long`}
        summary={[`${recording.chunks} ${recording.chunks === 1 ? 'chunk' : 'chunks'}`, megabytes(recording.bytes), recording.finalChainSha256 ? `chain ${recording.finalChainSha256.slice(0, 12)}` : null, recording.createdBy].filter(Boolean).join(', ')}
        trailing={
          <>
            <Tag tone={statusTone[recording.status]}>{statusWords[recording.status]}</Tag>
            {recording.chunks > 0 && (
              <>
                <Button size="sm" variant="ghost" disabled={loading} onClick={() => void load()}>
                  {source ? 'Loaded' : loading ? 'Loading…' : 'Play'}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={verify.isPending}
                  onClick={() => verify.mutate(recording.id, { onSuccess: setCheck, onError: (error) => t.error('Could not check the recording', { description: messageOf(error) }) })}
                >
                  Check
                </Button>
              </>
            )}
            <Button size="sm" variant="ghost" onClick={() => setOpen((v) => !v)}>
              {open ? 'Hide transcript' : 'Transcript'}
            </Button>
          </>
        }
      />
      {check && (
        <p className={check.intact ? 'pb-2 text-muted-foreground' : 'pb-2 text-destructive'}>
          {check.intact ? 'Every chunk is present and unchanged.' : `The recording does not hold${check.brokenAt != null ? ` at chunk ${check.brokenAt}` : ''}: ${check.reason ?? 'unknown'}.`}
        </p>
      )}
      {source && (
        <audio ref={audio} src={source} controls className="mb-2 w-full">
          <track kind="captions" />
        </audio>
      )}
      {open && <Transcript recording={recording} editable={transcriptEditable} onSeek={(ms) => void seek(ms)} />}
    </div>
  )
}

/** Recording a sitting. The audio is written in short chunks as it is captured,
 * each sealed and chained to the last, so a power cut loses only the chunk in
 * flight and nothing saved can be swapped. It is kept apart from any
 * transcript: if no transcript is ever made, the recording is still whole. */
export function RecordingSection({ sittingId, canRecord, transcriptEditable }: { sittingId: string; canRecord: boolean; transcriptEditable: boolean }) {
  const { data: recordings } = useRecordings(sittingId)
  const recorder = useRecorder(sittingId)
  const recording = recorder.state === 'recording'

  return (
    <section aria-labelledby="recording" className="page-section">
      <div className="section-head">
        <h2 id="recording">Recording</h2>
        {canRecord &&
          (recording || recorder.state === 'stopping' ? (
            <Button size="sm" variant="destructive" disabled={recorder.state === 'stopping'} onClick={() => void recorder.stop()}>
              {recorder.state === 'stopping' ? 'Saving…' : `Stop, ${clock(recorder.elapsedMs)}`}
            </Button>
          ) : (
            <Button size="sm" variant="secondary" disabled={!recorder.supported || recorder.state === 'starting'} onClick={() => void recorder.start()}>
              {recorder.state === 'starting' ? 'Starting…' : 'Start recording'}
            </Button>
          ))}
      </div>

      {!recorder.supported && <p className="text-muted-foreground">This computer&rsquo;s window cannot record audio, so this sitting can only be noted by hand. Nothing is lost by that: the notes are the record.</p>}
      {recorder.error && <p className="text-destructive">{recorder.error}</p>}
      {recording && recorder.pending > 0 && <p className="text-muted-foreground">{recorder.pending} {recorder.pending === 1 ? 'chunk is' : 'chunks are'} waiting to be saved.</p>}
      {recording && <p className="text-muted-foreground">Leaving this page while recording stops the microphone. What was saved is kept.</p>}

      {!recordings || recordings.length === 0 ? (
        <EmptyNote>No recording has been made of this sitting.</EmptyNote>
      ) : (
        <RowList>
          {recordings.map((r) => (
            <RecordingRow key={r.id} recording={r} transcriptEditable={transcriptEditable} />
          ))}
        </RowList>
      )}
    </section>
  )
}
