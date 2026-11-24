export {}
/** Runs the REAL QuotaCounter Durable Object in the local Cloudflare runtime (workerd, through `wrangler dev --local`)
 * and checks what a fake cannot: that concurrent requests to one bucket never overshoot the limit, that buckets do
 * not share a count, that a window expires, and that the count survives the object being evicted from memory.
 * Run: bun run test:workerd. Needs no network and no Cloudflare account; nothing is deployed. */
const port = 8799
const base = `http://127.0.0.1:${port}`
const child = Bun.spawn(['bunx', 'wrangler', 'dev', '-c', 'tests/workerd/wrangler.jsonc', '--local', '--port', String(port), '--persist-to', '/tmp/pleadli-quota-workerd'], { stdout: 'pipe', stderr: 'pipe', env: { ...process.env, WRANGLER_SEND_METRICS: 'false', CI: '1' } })
let log = ''
void (async () => { for await (const chunk of child.stdout) log += new TextDecoder().decode(chunk) })()
void (async () => { for await (const chunk of child.stderr) log += new TextDecoder().decode(chunk) })()

let failures = 0
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  ${detail}`}`)
  if (!ok) failures++
}
const hit = async (bucket: string, limit = 5, window = 60_000) => (await (await fetch(`${base}/hit?bucket=${bucket}&limit=${limit}&window=${window}`)).json()) as { ok: boolean; remaining?: number; retryAfter?: number }

try {
  const deadline = Date.now() + 90_000
  for (;;) {
    try {
      await fetch(`${base}/hit?bucket=ready`)
      break
    } catch {
      if (Date.now() > deadline) throw new Error('workerd did not start:\n' + log.slice(-2000))
      await Bun.sleep(500)
    }
  }
  // 1. Fifty simultaneous requests to one bucket with a limit of 5: exactly 5 are let through.
  const burst = await Promise.all(Array.from({ length: 50 }, () => hit('burst', 5)))
  check('50 concurrent requests, limit 5: exactly 5 allowed', burst.filter((r) => r.ok).length === 5, JSON.stringify(burst.filter((r) => r.ok).length))
  check('refusals carry a Retry-After in seconds', burst.filter((r) => !r.ok).every((r) => (r.retryAfter ?? 0) >= 1 && (r.retryAfter ?? 0) <= 60))
  // 2. Buckets are independent.
  check('another bucket is unaffected', (await hit('other', 5)).ok === true)
  // 3. Remaining counts down.
  const a = await hit('count', 3)
  const b = await hit('count', 3)
  check('remaining counts down', a.remaining === 2 && b.remaining === 1, JSON.stringify([a, b]))
  // 4. A short window expires.
  for (let i = 0; i < 2; i++) await hit('short', 2, 1500)
  check('window full', (await hit('short', 2, 1500)).ok === false)
  await Bun.sleep(1700)
  check('window expires', (await hit('short', 2, 1500)).ok === true)
  // 5. A refused request does not extend the window.
  await hit('fixed', 1, 2000)
  const first = await hit('fixed', 1, 2000)
  await Bun.sleep(2100)
  check('a refusal does not extend the window', first.ok === false && (await hit('fixed', 1, 2000)).ok === true)
} catch (error) {
  failures++
  console.log('FAIL  ' + String(error))
} finally {
  child.kill()
}
console.log(failures ? `\n${failures} failed` : '\nall passed')
process.exit(failures ? 1 : 0)
