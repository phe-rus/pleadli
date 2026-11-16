import { useEffect, useSyncExternalStore } from 'react'
import { isTauri } from '@tauri-apps/api/core'
import type { Update } from '@tauri-apps/plugin-updater'
import { Button } from '@pleadli/ui/button'
import { t } from '@pleadli/ui/goey-toaster'
import { SettingsCard } from '@/components/settings-card'

type State = { phase: 'idle' | 'checking' | 'available' | 'installing' | 'ready' | 'current' | 'failed'; version: string | null; current: string | null; error: string | null; progress: number }
let state: State = { phase: 'idle', version: null, current: null, error: null, progress: 0 }
let found: Update | null = null
const listeners = new Set<() => void>()
const set = (patch: Partial<State>) => { state = { ...state, ...patch }; listeners.forEach(listener => listener()) }
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener) } }
async function check(byHand = false) {
  if (!isTauri() || ['checking', 'installing', 'ready'].includes(state.phase)) return
  found = null; set({ phase: 'checking', error: null, version: null })
  try {
    const { getVersion } = await import('@tauri-apps/api/app')
    set({ current: await getVersion() })
    const { check } = await import('@tauri-apps/plugin-updater')
    found = await check()
    set({ phase: found ? 'available' : 'current', version: found?.version ?? null })
    if (found && !byHand) t.info('A Courts update is available', { description: `Version ${found.version}. Open Settings, Software update to install it.` })
  } catch (error) {
    set({ phase: byHand ? 'failed' : 'idle', error: byHand ? (error instanceof Error ? error.message : String(error)) : null })
  }
}
async function install() {
  if (!found || state.phase !== 'available') return
  set({ phase: 'installing', progress: 0, error: null })
  let total = 0, completed = 0
  try {
    await found.downloadAndInstall(event => {
      if (event.event === 'Started') total = event.data.contentLength ?? 0
      if (event.event === 'Progress') { completed += event.data.chunkLength ?? 0; set({ progress: total ? Math.min(1, completed / total) : 0 }) }
    })
    set({ phase: 'ready', progress: 1 })
  } catch (error) { set({ phase: 'failed', error: error instanceof Error ? error.message : String(error) }) }
}

/** Release copies check quietly. No installation or restart happens automatically. */
export function useSoftwareUpdateChecks() {
  useEffect(() => {
    if (!isTauri() || import.meta.env.DEV) return
    const first = setTimeout(() => void check(), 15_000)
    const repeat = setInterval(() => void check(), 6 * 60 * 60 * 1000)
    return () => { clearTimeout(first); clearInterval(repeat) }
  }, [])
}
export function SoftwareUpdatePane() {
  const value = useSyncExternalStore(subscribe, () => state)
  return <SettingsCard title="Software update" description="Updates are verified with Pleadli's signing key. Save your work before installing or restarting.">
    {!isTauri() ? <p>Open the desktop app to check and install updates.</p> : <>
      {value.current && <p>Installed version: {value.current}</p>}
      <p role="status">{value.phase === 'checking' ? 'Checking for updates…' : value.phase === 'current' ? 'This version is up to date for this computer.' : value.phase === 'available' ? `Version ${value.version} is available.` : value.phase === 'installing' ? `Installing update… ${Math.round(value.progress * 100)}%` : value.phase === 'ready' ? 'The update is installed. Restart when your work is saved.' : 'You can continue working offline when an update cannot be reached.'}</p>
      {value.error && <p role="alert" className="break-words text-destructive">{value.error}</p>}
      {value.phase === 'available' ? <Button onClick={() => void install()}>Install update</Button> : value.phase === 'ready' ? <Button onClick={async () => { const { relaunch } = await import('@tauri-apps/plugin-process'); await relaunch() }}>Restart Courts</Button> : <Button disabled={value.phase === 'checking' || value.phase === 'installing'} onClick={() => void check(true)}>Check for updates</Button>}
    </>}
  </SettingsCard>
}
