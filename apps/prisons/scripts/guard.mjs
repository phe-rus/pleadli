// Runs before `bun run tauri`: one instance only, and only when the machine has
// room. A second dev session, or one started with no memory to spare, is what
// freezes a laptop, so it is refused here with the reason.
import { readFileSync } from 'node:fs'
import net from 'node:net'

const PORTS = [3005, 47922]
const MIN_AVAILABLE_MB = 1500

const inUse = (port) =>
  new Promise((resolve) => {
    const socket = net.connect({ port, host: '127.0.0.1' })
    socket.once('connect', () => (socket.destroy(), resolve(true)))
    socket.once('error', () => resolve(false))
  })

for (const port of PORTS) {
  if (await inUse(port)) {
    console.error(`\nAlready running: something is listening on port ${port}. Stop the other Pleadli Prisons session first (only one may run).\n`)
    process.exit(1)
  }
}

try {
  const meminfo = readFileSync('/proc/meminfo', 'utf8')
  const available = Number(/MemAvailable:\s+(\d+)/.exec(meminfo)?.[1] ?? 0) / 1024
  if (available < MIN_AVAILABLE_MB) {
    console.error(`\nNot enough free memory to start: ${Math.round(available)} MB available, ${MIN_AVAILABLE_MB} MB needed. Close something and try again.\n`)
    process.exit(1)
  }
} catch {
  // Not Linux: no check.
}
