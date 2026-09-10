import { useCallback, useRef } from 'react'

/**
 * A synthesized two-tone ring via the Web Audio API — no bundled sound
 * asset, no licensing question, and it can actually loop, unlike a
 * native OS notification sound (which every platform limits to a single
 * one-shot chime). Keeps ringing every couple of seconds until `stop()`
 * is called (an officer responds, or the dispatch ends).
 *
 * Browsers (and this app's WebKit-based webview) can require a user
 * gesture before audio is allowed to play — if the very first alert of
 * a session arrives before the officer has clicked anything in the app,
 * the ring may not sound until after that. The native notification's
 * one-shot chime (set separately, in the Rust `/backup-alert` handler)
 * is the fallback for exactly that case.
 */
export function useBackupRingtone() {
  const audioContextRef = useRef<AudioContext | null>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const playTone = (ctx: AudioContext, frequency: number, startTime: number, duration: number) => {
    const oscillator = ctx.createOscillator()
    const gain = ctx.createGain()
    oscillator.type = 'sine'
    oscillator.frequency.value = frequency
    gain.gain.setValueAtTime(0.0001, startTime)
    gain.gain.exponentialRampToValueAtTime(0.3, startTime + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration)
    oscillator.connect(gain)
    gain.connect(ctx.destination)
    oscillator.start(startTime)
    oscillator.stop(startTime + duration)
  }

  const ringOnce = (ctx: AudioContext) => {
    const now = ctx.currentTime
    playTone(ctx, 880, now, 0.35)
    playTone(ctx, 660, now + 0.4, 0.35)
  }

  const start = useCallback(() => {
    if (intervalRef.current) return
    try {
      const ctx = new AudioContext()
      audioContextRef.current = ctx
      ringOnce(ctx)
      intervalRef.current = setInterval(() => ringOnce(ctx), 2000)
    } catch {
      // Audio unavailable (autoplay policy, no audio device, etc.) — the
      // modal and toast still carry the alert, this just stays silent.
    }
  }, [])

  const stop = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
    audioContextRef.current?.close().catch(() => {})
    audioContextRef.current = null
  }, [])

  return { start, stop }
}
