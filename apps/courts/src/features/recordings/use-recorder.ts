import { ApiError } from '@/lib/api'
import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useRef, useState } from 'react'
import { sendChunk, startRecording, stopRecording } from './data'

/** Audio formats tried in order; the webview supports some of these. */
const MIME_CANDIDATES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4']
/** A chunk every five seconds: a power cut loses at most about that much. */
const CHUNK_MS = 5000

export type RecorderState = 'idle' | 'starting' | 'recording' | 'stopping'

type Queued = { seq: number; offsetMs: number; durationMs: number; dataBase64: string }

function toBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(reader.error)
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '')
    reader.readAsDataURL(blob)
  })
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

export function recordingSupported(): boolean {
  return typeof window !== 'undefined' && typeof MediaRecorder !== 'undefined' && !!navigator.mediaDevices?.getUserMedia
}

/**
 * Records the microphone in the webview and sends it to the application in short
 * chunks as it is captured. Sending is separate from capturing: chunks wait in a
 * queue and are retried, in order, until they are saved, so a slow or failing
 * save never stops the recording and never reorders it. `pending` is how many
 * chunks are captured but not yet saved, and is shown so a problem is never
 * silent. Nothing here decides what is authoritative: the audio is a record, and
 * the signed bench record is still the officer's own.
 */
export function useRecorder(sittingId: string) {
  const queryClient = useQueryClient()
  const [state, setState] = useState<RecorderState>('idle')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(0)
  const [elapsedMs, setElapsedMs] = useState(0)
  const recorder = useRef<MediaRecorder | null>(null)
  const stream = useRef<MediaStream | null>(null)
  const recordingId = useRef<string | null>(null)
  const queue = useRef<Queued[]>([])
  const draining = useRef(false)
  const seq = useRef(0)
  const startedAt = useRef(0)
  const lastChunkEnd = useRef(0)
  const failing = useRef(false)
  /** Reading a chunk's bytes is asynchronous; chained so chunks reach the queue in order. */
  const converting = useRef<Promise<void>>(Promise.resolve())

  const refresh = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ['recordings', sittingId] })
  }, [queryClient, sittingId])

  const drain = useCallback(async () => {
    if (draining.current) return
    draining.current = true
    try {
      while (queue.current.length > 0 && recordingId.current) {
        const next = queue.current[0]
        let delay = 1000
        for (;;) {
          try {
            await sendChunk(recordingId.current, next)
            failing.current = false
            setError(null)
            break
          } catch (e) {
            // A refusal that will not change (the recording is finished, a chunk
            // is out of order) is not retried forever.
            if (e instanceof ApiError && e.status === 422) {
              setError(e.message)
              queue.current.shift()
              break
            }
            failing.current = true
            setError('Some audio has not been saved yet. It is kept and will be sent again.')
            await sleep(delay)
            delay = Math.min(delay * 2, 15000)
          }
        }
        if (queue.current[0] === next) queue.current.shift()
        setPending(queue.current.length)
      }
    } finally {
      draining.current = false
      setPending(queue.current.length)
    }
  }, [])

  const start = useCallback(async () => {
    if (state !== 'idle') return
    setError(null)
    setState('starting')
    try {
      const media = await navigator.mediaDevices.getUserMedia({ audio: true })
      stream.current = media
      const mime = MIME_CANDIDATES.find((m) => MediaRecorder.isTypeSupported(m)) ?? ''
      const rec = new MediaRecorder(media, mime ? { mimeType: mime } : undefined)
      const recording = await startRecording(sittingId, rec.mimeType || mime || 'audio/webm')
      recordingId.current = recording.id
      seq.current = 0
      queue.current = []
      startedAt.current = performance.now()
      lastChunkEnd.current = 0
      converting.current = Promise.resolve()
      rec.ondataavailable = (event) => {
        if (event.data.size === 0) return
        const now = performance.now() - startedAt.current
        const numbers = { seq: seq.current++, offsetMs: Math.round(lastChunkEnd.current), durationMs: Math.max(1, Math.round(now - lastChunkEnd.current)) }
        lastChunkEnd.current = now
        const blob = event.data
        // The numbers are fixed now, in the order the chunks arrived; the bytes
        // are read one chunk at a time so they join the queue in that order.
        converting.current = converting.current.then(async () => {
          queue.current.push({ ...numbers, dataBase64: await toBase64(blob) })
          setPending(queue.current.length)
          void drain()
        })
      }
      rec.start(CHUNK_MS)
      recorder.current = rec
      setState('recording')
      refresh()
    } catch (e) {
      stream.current?.getTracks().forEach((t) => t.stop())
      setState('idle')
      setError(e instanceof ApiError ? e.message : 'The microphone could not be used. Check that it is connected and that this application may use it.')
    }
  }, [drain, refresh, sittingId, state])

  const stop = useCallback(async () => {
    const rec = recorder.current
    if (!rec || state !== 'recording') return
    setState('stopping')
    await new Promise<void>((resolve) => {
      rec.onstop = () => resolve()
      rec.stop()
    })
    stream.current?.getTracks().forEach((t) => t.stop())
    // Let the last chunk be read, then wait for everything to be saved.
    await converting.current
    const deadline = Date.now() + 60_000
    while ((queue.current.length > 0 || draining.current) && Date.now() < deadline) {
      void drain()
      await sleep(500)
    }
    try {
      if (recordingId.current) await stopRecording(recordingId.current)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'The recording could not be closed. What was saved is kept.')
    }
    if (queue.current.length > 0) setError('Some audio could not be saved and was lost. What was saved is kept.')
    recorder.current = null
    recordingId.current = null
    queue.current = []
    setPending(0)
    setState('idle')
    refresh()
  }, [drain, refresh, state])

  useEffect(() => {
    if (state !== 'recording') return
    const timer = setInterval(() => setElapsedMs(performance.now() - startedAt.current), 500)
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault()
    }
    window.addEventListener('beforeunload', warn)
    return () => {
      clearInterval(timer)
      window.removeEventListener('beforeunload', warn)
    }
  }, [state])

  // If the page is left while recording, the microphone is released; what was
  // saved stays, and the application closes the recording as interrupted.
  useEffect(
    () => () => {
      stream.current?.getTracks().forEach((t) => t.stop())
    },
    [],
  )

  return { state, error, pending, elapsedMs, supported: recordingSupported(), failing: failing.current, start, stop }
}
