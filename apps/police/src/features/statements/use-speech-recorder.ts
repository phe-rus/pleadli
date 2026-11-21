import { api } from '@/lib/api'
import { useCallback, useEffect, useRef, useState } from 'react'

export type SpokenLine = { startMs: number; endMs: number; text: string }

const RATE = 16000
/** How much speech is sent for words at a time. Shorter shows words sooner but cuts sentences. */
const WINDOW_SECONDS = 10

function toBase64(bytes: Uint8Array) {
  let binary = ''
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(binary)
}

function join(chunks: Float32Array[]) {
  const out = new Float32Array(chunks.reduce((n, c) => n + c.length, 0))
  let at = 0
  for (const c of chunks) {
    out.set(c, at)
    at += c.length
  }
  return out
}

/**
 * Records the microphone and, every few seconds, asks the app (offline, on this computer) for the
 * words in what was just said. Two things are kept: the audio, to be sealed with the statement,
 * and the lines, which the officer reads against it and corrects. The lines are only a draft.
 */
export function useSpeechRecorder(language: string) {
  const [state, setState] = useState<'idle' | 'recording' | 'finishing'>('idle')
  const [lines, setLines] = useState<SpokenLine[]>([])
  const [audio, setAudio] = useState<Blob | null>(null)
  const [error, setError] = useState<string | null>(null)
  const parts = useRef<{ stream?: MediaStream; ctx?: AudioContext; node?: ScriptProcessorNode; rec?: MediaRecorder; media: Blob[]; pending: Float32Array[]; sent: number; chain: Promise<void> }>({
    media: [],
    pending: [],
    sent: 0,
    chain: Promise.resolve(),
  })

  const send = useCallback(
    (final: boolean) => {
      const p = parts.current
      const samples = join(p.pending)
      // A last short tail is still sent; otherwise wait for a full window.
      if (samples.length < (final ? RATE / 2 : WINDOW_SECONDS * RATE)) return
      p.pending = []
      const offsetMs = Math.round((p.sent / RATE) * 1000)
      p.sent += samples.length
      p.chain = p.chain.then(async () => {
        try {
          const body = JSON.stringify({ samplesBase64: toBase64(new Uint8Array(samples.buffer)) })
          const result: SpokenLine[] = await api(`/transcription/transcribe?language=${encodeURIComponent(language)}&offsetMs=${offsetMs}`, { method: 'POST', body })
          setLines((prev) => [...prev, ...result])
        } catch (e) {
          setError(e instanceof Error ? e.message : 'The words could not be written.')
        }
      })
    },
    [language],
  )

  const start = useCallback(async () => {
    setError(null)
    setLines([])
    setAudio(null)
    const p = parts.current
    p.media = []
    p.pending = []
    p.sent = 0
    p.chain = Promise.resolve()
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: false, noiseSuppression: false } })
      const ctx = new AudioContext({ sampleRate: RATE })
      const source = ctx.createMediaStreamSource(stream)
      const node = ctx.createScriptProcessor(4096, 1, 1)
      node.onaudioprocess = (event) => {
        p.pending.push(new Float32Array(event.inputBuffer.getChannelData(0)))
        send(false)
      }
      source.connect(node)
      node.connect(ctx.destination)
      const rec = new MediaRecorder(stream)
      rec.ondataavailable = (e) => e.data.size && p.media.push(e.data)
      rec.start(5000)
      Object.assign(p, { stream, ctx, node, rec })
      setState('recording')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The microphone could not be used.')
    }
  }, [send])

  const stop = useCallback(async () => {
    const p = parts.current
    setState('finishing')
    p.node?.disconnect()
    await new Promise<void>((resolve) => {
      if (!p.rec || p.rec.state === 'inactive') return resolve()
      p.rec.onstop = () => resolve()
      p.rec.stop()
    })
    p.stream?.getTracks().forEach((t) => t.stop())
    await p.ctx?.close().catch(() => {})
    send(true)
    await p.chain
    setAudio(new Blob(p.media, { type: p.rec?.mimeType || 'audio/webm' }))
    setState('idle')
  }, [send])

  useEffect(
    () => () => {
      const p = parts.current
      p.node?.disconnect()
      p.stream?.getTracks().forEach((t) => t.stop())
    },
    [],
  )

  return { state, lines, audio, error, start, stop, clear: () => (setLines([]), setAudio(null)) }
}

export async function blobToBase64(blob: Blob) {
  return toBase64(new Uint8Array(await blob.arrayBuffer()))
}
