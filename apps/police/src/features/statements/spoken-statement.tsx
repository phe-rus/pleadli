import * as m from '@/paraglide/messages'
import { api } from '@/lib/api'
import { Button } from '@pleadli/ui/button'
import { Field, FieldLabel } from '@pleadli/ui/field'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useSpeechRecorder } from './use-speech-recorder'

type Status = { available: boolean; reason: string; installing: boolean; downloadedBytes: number; totalBytes: number; installError: string | null }

const languages = () => [
  { value: 'en', label: m['statements.spoken_en']() },
  { value: 'sw', label: m['statements.spoken_sw']() },
  { value: 'fr', label: m['statements.spoken_fr']() },
  { value: 'auto', label: m['statements.spoken_auto']() },
]

/**
 * Takes a statement by voice: records, writes the words as they are said (on this computer), and
 * hands both up. The words are a draft for the officer to read against the recording and correct.
 */
export function SpokenStatement({ hasText, onWords, onAudio }: { hasText: boolean; onWords: (text: string) => void; onAudio: (audio: Blob | null) => void }) {
  const [language, setLanguage] = useState('en')
  const { data: status } = useQuery<Status>({ queryKey: ['transcription-status'], queryFn: () => api('/transcription/status'), staleTime: 60_000, refetchInterval: (q) => (q.state.data?.installing ? 1000 : false) })
  const queryClient = useQueryClient()
  const rec = useSpeechRecorder(language)
  const words = rec.lines.map((l) => l.text).join(' ')
  const recording = rec.state === 'recording'

  async function toggle() {
    if (recording) {
      await rec.stop()
    } else {
      onAudio(null)
      await rec.start()
    }
  }

  // Once recording has finished, give the recording up to the form and fill an empty statement.
  const [handed, setHanded] = useState<Blob | null>(null)
  if (rec.audio && rec.audio !== handed) {
    setHanded(rec.audio)
    onAudio(rec.audio)
    if (!hasText && words) onWords(words)
  }

  return (
    <Field className="rounded-lg border p-3">
      <FieldLabel>{m['statements.spoken_title']()}</FieldLabel>
      <p className="text-sm text-muted-foreground">{m['statements.spoken_help']()}</p>
      {status && !status.available && <p className="text-sm text-muted-foreground">{status.reason || m['statements.spoken_unavailable']()}</p>}
      {status && !status.available && (
        <div className="flex flex-col gap-1">
          <Button
            type="button"
            variant="outline"
            disabled={status.installing}
            onClick={async () => {
              await api('/transcription/install', { method: 'POST' })
              queryClient.invalidateQueries({ queryKey: ['transcription-status'] })
            }}
          >
            {status.installing ? `${m['statements.spoken_downloading']()} ${Math.round((status.downloadedBytes / status.totalBytes) * 100)}%` : m['statements.spoken_download']()}
          </Button>
          {status.installError && <p className="text-sm text-destructive">{status.installError}</p>}
          <p className="text-xs text-muted-foreground">{m['statements.spoken_download_note']()}</p>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <select
          aria-label={m['statements.spoken_language']()}
          className="h-9 rounded-md border bg-background px-2 text-sm"
          value={language}
          disabled={rec.state !== 'idle'}
          onChange={(e) => setLanguage(e.target.value)}
        >
          {languages().map((l) => (
            <option key={l.value} value={l.value}>
              {l.label}
            </option>
          ))}
        </select>
        <Button type="button" variant={recording ? 'destructive' : 'default'} disabled={rec.state === 'finishing'} onClick={toggle}>
          {recording ? m['statements.spoken_stop']() : m['statements.spoken_record']()}
        </Button>
      </div>
      {recording && <p className="text-sm">{m['statements.spoken_recording']()}</p>}
      {rec.state === 'finishing' && <p className="text-sm">{m['statements.spoken_working']()}</p>}
      {rec.error && <p className="text-sm text-destructive">{rec.error}</p>}
      {(recording || rec.lines.length > 0) && (
        <div className="flex flex-col gap-2">
          <p className="max-h-40 overflow-y-auto rounded-md bg-muted p-2 text-sm" aria-live="polite">
            {words || m['statements.spoken_no_words']()}
          </p>
          {rec.audio && (
            <>
              <audio controls src={URL.createObjectURL(rec.audio)} className="w-full" />
              <p className="text-sm text-muted-foreground">{m['statements.spoken_kept']()}</p>
              {words && (
                <Button type="button" variant="outline" onClick={() => onWords(words)}>
                  {m['statements.spoken_use']()}
                </Button>
              )}
            </>
          )}
        </div>
      )}
    </Field>
  )
}
