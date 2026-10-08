import { isTauri } from '@tauri-apps/api/core'
import * as m from '@/paraglide/messages'
import { t } from '@pleadli/ui/goey-toaster'
import { useSyncExternalStore } from 'react'

/** Where an update stands, read by Settings > Software update. */
export type UpdateState = {
  phase: 'unsupported' | 'idle' | 'checking' | 'current' | 'available' | 'downloading' | 'ready' | 'failed' | 'no_build'
  current: string | null
  version: string | null
  /** 0 to 1 while downloading. */
  progress: number
  checkedAt: number | null
  error: string | null
}

const AUTO_KEY = 'pleadli:lawyers:auto-update'
let state: UpdateState = { phase: isTauri() ? 'idle' : 'unsupported', current: null, version: null, progress: 0, checkedAt: null, error: null }
const listeners = new Set<() => void>()
const set = (next: Partial<UpdateState>) => {
  state = { ...state, ...next }
  listeners.forEach((l) => l())
}
export const useUpdateState = () =>
  useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => state,
  )

/** Updates download by themselves unless someone turned that off on this computer. */
export function autoUpdate() {
  try {
    return localStorage.getItem(AUTO_KEY) !== '0'
  } catch {
    return true
  }
}
export function setAutoUpdate(on: boolean) {
  try {
    localStorage.setItem(AUTO_KEY, on ? '1' : '0')
  } catch {}
  listeners.forEach((l) => l())
}

type Found = { version: string; downloadAndInstall: (progress?: (e: { event: string; data?: { contentLength?: number; chunkLength?: number } }) => void) => Promise<void> }
let found: Found | null = null

async function loadCurrent() {
  if (state.current || !isTauri()) return
  const { getVersion } = await import('@tauri-apps/api/app')
  set({ current: await getVersion() })
}

/** Asks the release feed once. Quiet when it fails unless asked by hand
 * (no internet is normal here). */
export async function checkNow(byHand = false) {
  if (!isTauri() || state.phase === 'checking' || state.phase === 'downloading') return
  await loadCurrent().catch(() => {})
  set({ phase: 'checking', error: null })
  try {
    const { check } = await import('@tauri-apps/plugin-updater')
    const update = (await check()) as Found | null
    found = update
    if (!update) return set({ phase: 'current', version: null, checkedAt: Date.now() })
    set({ phase: 'available', version: update.version, checkedAt: Date.now() })
    if (autoUpdate()) await download()
    else if (!byHand) t.info(m["update.available"]({ version: update.version }), { action: { label: m["update.get"](), onClick: () => void download() } })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    // Releases are built for some systems only (Windows today): a feed with no
    // build for this one is a fact to state, not a failure to show.
    if (/platforms/i.test(message)) return set({ phase: 'no_build', error: null, checkedAt: Date.now() })
    set({ phase: byHand ? 'failed' : 'idle', error: message, checkedAt: Date.now() })
  }
}

/** Downloads and installs the update found; the app restarts when the person says. */
export async function download() {
  if (!found || state.phase === 'downloading') return
  let total = 0
  let done = 0
  set({ phase: 'downloading', progress: 0 })
  try {
    await found.downloadAndInstall((e) => {
      if (e.event === 'Started') total = e.data?.contentLength ?? 0
      if (e.event === 'Progress') {
        done += e.data?.chunkLength ?? 0
        set({ progress: total ? done / total : 0 })
      }
    })
    set({ phase: 'ready', progress: 1 })
    t.success(m["update.ready"]({ version: state.version ?? '' }), { action: { label: m["update.restart"](), onClick: () => void restart() } })
  } catch (error) {
    set({ phase: 'failed', error: error instanceof Error ? error.message : String(error) })
  }
}

export async function restart() {
  const { relaunch } = await import('@tauri-apps/plugin-process')
  await relaunch()
}

/** Installed copies look for a signed update 15 seconds after they start and
 * every six hours. Nothing restarts without the person saying so. */
export function startUpdateChecks() {
  if (!isTauri()) return
  void loadCurrent().catch(() => {})
  if (import.meta.env.DEV) return
  setTimeout(() => void checkNow(), 15_000)
  setInterval(() => void checkNow(), 6 * 60 * 60 * 1000)
}
