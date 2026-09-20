import { onlineManager } from '@tanstack/react-query'
import { useSyncExternalStore } from 'react'
import { logFrontendError } from '@/lib/forward-errors-to-log'

export type ErrorSource = 'render' | 'route' | 'window' | 'query' | 'loop'

export type ErrorReport = {
  id: number
  source: ErrorSource
  name: string
  message: string
  stack: string
  componentStack: string
  route: string
  at: number
}

type State = { report: ErrorReport | null; tries: number; halted: boolean; haltedCount: number; resetTick: number }

/** How many times the officer may press Try again before only Reload is left. */
export const MAX_TRIES = 3
/** The tries budget refills after this long without an error. */
const HEALTHY_MS = 60_000
/** This many errors inside this window is a loop, not a failure. */
const LOOP_LIMIT = 6
const LOOP_WINDOW_MS = 3_000

let state: State = { report: null, tries: 0, halted: false, haltedCount: 0, resetTick: 0 }
let lastErrorAt = 0
let nextId = 1
const recent: number[] = []
const listeners = new Set<() => void>()

const set = (next: Partial<State>) => {
  state = { ...state, ...next }
  listeners.forEach((listener) => listener())
}

const BENIGN = /ResizeObserver loop|Script error\.?$/i

function normalise(error: unknown) {
  if (error instanceof Error) return { name: error.name, message: error.message, stack: error.stack ?? '' }
  return { name: 'Error', message: typeof error === 'string' ? error : JSON.stringify(error) ?? String(error), stack: '' }
}

/** Every error in the app comes through here. A render or route error opens
 * the dialog. Window and query errors only count, and open it only when they
 * arrive fast enough to be a loop. Once halted, the app stops fetching and
 * stops retrying by itself: a runaway must end in a dialog, not a frozen
 * laptop. */
export function reportError(error: unknown, source: ErrorSource, componentStack = '') {
  const info = normalise(error)
  if (BENIGN.test(info.message)) return
  const now = Date.now()
  if (now - lastErrorAt > HEALTHY_MS && !state.halted) state = { ...state, tries: 0 }
  lastErrorAt = now
  recent.push(now)
  while (recent.length && now - recent[0] > LOOP_WINDOW_MS) recent.shift()
  void logFrontendError(`${source}: ${info.name}: ${info.message}`)

  const report: ErrorReport = { id: nextId++, source, ...info, componentStack, route: typeof location === 'undefined' ? '' : location.pathname, at: now }
  if (!state.halted && recent.length >= LOOP_LIMIT) {
    onlineManager.setOnline(false)
    set({ halted: true, haltedCount: recent.length, report: { ...(state.report ?? report), source: 'loop' } })
    return
  }
  if (state.halted) return
  if (source === 'window' || source === 'query') return
  set({ report })
}

/** One more try, if the budget allows: closes the dialog and remounts what failed. */
export function retry() {
  if (state.halted || state.tries >= MAX_TRIES) return
  set({ tries: state.tries + 1, report: null, resetTick: state.resetTick + 1 })
}

export function reloadWindow() {
  location.reload()
}

const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => void listeners.delete(listener)
}

export function useErrorState() {
  return useSyncExternalStore(subscribe, () => state, () => state)
}

/** Catches what React does not: errors thrown outside a render, and promises
 * nobody handled. Returns a function that removes the listeners. */
export function watchWindowErrors() {
  const onError = (event: ErrorEvent) => reportError(event.error ?? event.message, 'window')
  const onRejection = (event: PromiseRejectionEvent) => reportError(event.reason, 'window')
  window.addEventListener('error', onError)
  window.addEventListener('unhandledrejection', onRejection)
  return () => {
    window.removeEventListener('error', onError)
    window.removeEventListener('unhandledrejection', onRejection)
  }
}
