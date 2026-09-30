import { isTauri } from '@tauri-apps/api/core'

/** Installed copies look for a signed update when they start and every six
 * hours. Nothing is installed without the person saying yes, and a check that
 * fails (no internet, which is normal here) says nothing. */
export function startUpdateChecks() {
  if (!isTauri() || import.meta.env.DEV) return
  let asking = false
  const check = async () => {
    if (asking) return
    try {
      const { check: findUpdate } = await import('@tauri-apps/plugin-updater')
      const update = await findUpdate()
      if (!update) return
      asking = true
      const { ask } = await import('@tauri-apps/plugin-dialog')
      const yes = await ask(`Version ${update.version} is ready (you have ${update.currentVersion}). Install it now? The app restarts when it is done.`, {
        title: 'Update available',
        kind: 'info',
        okLabel: 'Install and restart',
        cancelLabel: 'Later',
      })
      if (yes) {
        await update.downloadAndInstall()
        const { relaunch } = await import('@tauri-apps/plugin-process')
        await relaunch()
      }
    } catch (error) {
      console.warn('update check failed', error)
    } finally {
      asking = false
    }
  }
  setTimeout(check, 15_000)
  setInterval(check, 6 * 60 * 60 * 1000)
}
