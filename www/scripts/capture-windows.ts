// Captures each app's replica window to a PNG, through WebKit's own WebDriver (the engine the apps use).
// Needs `bun run dev` on port 3000 and the apt package webkit2gtk-driver. Usage: bun scripts/capture-windows.ts <out-dir>
import { spawn } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'

const out = process.argv[2]
if (!out) throw new Error('usage: bun scripts/capture-windows.ts <out-dir>')
mkdirSync(out, { recursive: true })

const PORT = 4455
const base = `http://127.0.0.1:${PORT}`
const driver = spawn('WebKitWebDriver', [`--port=${PORT}`], { stdio: 'ignore' })
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))
const call = async (method: string, path: string, body?: unknown) => {
  const res = await fetch(base + path, { method, headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined })
  const json = (await res.json()) as { value: any }
  if (!res.ok) throw new Error(`${method} ${path}: ${JSON.stringify(json.value)}`)
  return json.value
}

// Which row to open for the second picture of each app.
const second: Record<string, string> = { police: 'In custody', dpp: 'Inbox', courts: 'Cause list', lawyers: 'Criminal register', prisons: 'Everyone held' }

try {
  await wait(1200)
  const session = await call('POST', '/session', {
    capabilities: { alwaysMatch: { browserName: 'MiniBrowser', 'webkitgtk:browserOptions': { binary: '/usr/lib/x86_64-linux-gnu/webkit2gtk-4.1/MiniBrowser', args: ['--automation'] } } },
  })
  const id = session.sessionId as string
  await call('POST', `/session/${id}/window/rect`, { width: 1400, height: 1400, x: 0, y: 0 })
  const shoot = async (name: string) => {
    const el = await call('POST', `/session/${id}/element`, { using: 'css selector', value: '#shot' })
    const png = (await call('GET', `/session/${id}/element/${el['element-6066-11e4-a52e-4f735466cecf']}/screenshot`)) as string
    writeFileSync(`${out}/${name}.png`, Buffer.from(png, 'base64'))
    console.log('captured', name)
  }
  for (const slug of Object.keys(second)) {
    await call('POST', `/session/${id}/url`, { url: `http://localhost:3000/shots/${slug}` })
    await wait(3500)
    await shoot(`${slug}-today`)
    const row = second[slug]
    await call('POST', `/session/${id}/execute/sync`, { script: `const t=[...document.querySelectorAll('#shot span')].find(s=>s.textContent==='${row}'); if(t) t.click(); return !!t`, args: [] })
    await wait(1200)
    await shoot(`${slug}-${row.toLowerCase().replaceAll(' ', '-')}`)
  }
  await call('DELETE', `/session/${id}`)
} finally {
  driver.kill()
}
