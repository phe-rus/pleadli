import { identify } from '@/lib/computer-auth.server'
import { env } from 'cloudflare:workers'

/**
 * Remote access for a station without a Cloudflare account. A licensed
 * computer asks (POST /api/orchestra/v1/tunnel, body {port}); Pleadli
 * creates or reuses that office's tunnel, points <name>.pleadli.com at it and
 * returns the address and the token the computer runs `cloudflared` with.
 * The Cloudflare credentials live only here, as Worker secrets:
 * CF_TUNNEL_API_TOKEN (Tunnel: Edit + DNS: Edit), CF_ACCOUNT_ID, CF_ZONE_ID.
 * The tunnel carries only the station's restricted search and alerts page.
 */

const DOMAIN = 'pleadli.com'
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } })
const fail = (status: number, code: string, message: string) => json({ error: code, message }, status)

type Secrets = { CF_TUNNEL_API_TOKEN?: string; CF_ACCOUNT_ID?: string; CF_ZONE_ID?: string }

/** st-<office address>: letters, digits and hyphens, at most 50 characters. */
export function stationName(address: string) {
  const slug = address.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 46).replace(/-+$/g, '')
  return `st-${slug || 'office'}`
}

async function cloudflare<T>(secrets: Required<Secrets>, path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`https://api.cloudflare.com/client/v4${path}`, {
    ...init,
    headers: { authorization: `Bearer ${secrets.CF_TUNNEL_API_TOKEN}`, 'content-type': 'application/json' },
  })
  const body = (await response.json().catch(() => null)) as { success?: boolean; result?: T; errors?: { message: string }[] } | null
  if (!response.ok || !body?.success) throw new Error(body?.errors?.[0]?.message ?? `Cloudflare answered ${response.status}`)
  return body.result as T
}

export async function handleTunnelV1(request: Request): Promise<Response> {
  if (request.method !== 'POST') return fail(405, 'method', 'Use POST.')
  const caller = await identify(request)
  if (!caller) return fail(401, 'unauthorised', 'This computer is not signed in to an office.')
  if (!caller.licensed) return fail(403, 'licence', 'Remote access needs an active licence.')
  const secrets = env as unknown as Secrets
  if (!secrets.CF_TUNNEL_API_TOKEN || !secrets.CF_ACCOUNT_ID || !secrets.CF_ZONE_ID) return fail(503, 'not_configured', 'Remote access is not switched on at Pleadli yet.')
  const ready = secrets as Required<Secrets>

  const asked = (await request.json().catch(() => ({}))) as { port?: unknown }
  const port = Number(asked.port)
  if (!Number.isInteger(port) || port < 1024 || port > 65535) return fail(400, 'port', 'Give the local port the station page listens on.')

  const name = stationName(caller.address)
  const hostname = `${name}.${DOMAIN}`
  const account = `/accounts/${ready.CF_ACCOUNT_ID}`
  try {
    const found = await cloudflare<{ id: string }[]>(ready, `${account}/cfd_tunnel?name=${encodeURIComponent(name)}&is_deleted=false`)
    const tunnelId = found[0]?.id ?? (await cloudflare<{ id: string }>(ready, `${account}/cfd_tunnel`, { method: 'POST', body: JSON.stringify({ name, config_src: 'cloudflare' }) })).id

    await cloudflare(ready, `${account}/cfd_tunnel/${tunnelId}/configurations`, {
      method: 'PUT',
      body: JSON.stringify({ config: { ingress: [{ hostname, service: `http://localhost:${port}` }, { service: 'http_status:404' }] } }),
    })

    const target = `${tunnelId}.cfargotunnel.com`
    const zone = `/zones/${ready.CF_ZONE_ID}/dns_records`
    const records = await cloudflare<{ id: string; content: string }[]>(ready, `${zone}?type=CNAME&name=${encodeURIComponent(hostname)}`)
    const record = { type: 'CNAME', name: hostname, content: target, proxied: true }
    if (!records[0]) await cloudflare(ready, zone, { method: 'POST', body: JSON.stringify(record) })
    else if (records[0].content !== target) await cloudflare(ready, `${zone}/${records[0].id}`, { method: 'PUT', body: JSON.stringify(record) })

    const token = await cloudflare<string>(ready, `${account}/cfd_tunnel/${tunnelId}/token`)
    return json({ hostname, token })
  } catch (e) {
    console.error('tunnel', e instanceof Error ? e.message : e)
    return fail(502, 'cloudflare', 'Pleadli could not set up the tunnel just now. Try again in a few minutes.')
  }
}
