import { isTauri } from '@tauri-apps/api/core'

/**
 * Forwards uncaught frontend errors into the same log file
 * tauri-plugin-log already writes Rust-side logs to — an officer's
 * station machine has no devtools console to hand back to support, so
 * this is the only trace of a frontend crash that survives.
 */
export function forwardErrorsToLog() {
  if (!isTauri()) return

  window.addEventListener('error', (event) => {
    void logError(`Uncaught error: ${event.message} (${event.filename}:${event.lineno})`)
  })
  window.addEventListener('unhandledrejection', (event) => {
    void logError(`Unhandled rejection: ${String(event.reason)}`)
  })
}

async function logError(message: string) {
  try {
    const { error } = await import('@tauri-apps/plugin-log')
    await error(message)
  } catch {
    // Logging is best-effort; never let a failed log call itself throw.
  }
}
