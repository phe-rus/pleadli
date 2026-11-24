import { findCase, findPaper } from '@/lib/public-lookup.server'
import { limitAnonymous, tooManyResponse } from '@/lib/quota.server'
import { normaliseCode } from '@/lib/orchestra'
import { createFileRoute } from '@tanstack/react-router'

/** GET /api/public/v1/verify?code=  and  /track?code=
 * Anyone holding a code may ask whether a paper is genuine or where a case
 * stands. The answers are already public on /verify and /track, so any
 * website may call this (CORS open, no cookies). No search by name, ever.
 * Same answer for "no such code" and "not yours": nothing is learned by guessing.
 * docs/platform/PUBLIC-AND-FIELD-API.md section 2. */

const headers = {
  'content-type': 'application/json; charset=utf-8',
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, OPTIONS',
  'cache-control': 'no-store',
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers })

async function handle(request: Request, name: string) {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers })
  if (request.method !== 'GET') return json({ error: 'method_not_allowed' }, 405)
  // Quota first: it needs nothing from the request but the address Cloudflare saw, so a refused caller costs no database read.
  const quota = await limitAnonymous(request)
  if (!quota.ok) return tooManyResponse(quota, { 'access-control-allow-origin': '*' })
  const code = new URL(request.url).searchParams.get('code')?.slice(0, 40) ?? ''
  if (!code) return json({ error: 'code_needed' }, 400)
  // A code that cannot be one is refused before any database read, with the same answer as an unknown one.
  const clean = normaliseCode(code)
  if (clean.length < 8 || clean.length > 24) return json(name === 'verify' ? { genuine: false, error: 'not_found' } : { error: 'not_found' }, 404)
  if (name === 'verify') {
    const found = await findPaper(code)
    return found ? json({ genuine: true, paper: found }) : json({ genuine: false, error: 'not_found' }, 404)
  }
  if (name === 'track') {
    const found = await findCase(code)
    return found ? json(found) : json({ error: 'not_found' }, 404)
  }
  return json({ error: 'unknown_call' }, 404)
}

export const Route = createFileRoute('/api/public/v1/$')({
  server: {
    handlers: {
      GET: ({ request, params }) => handle(request, params._splat ?? ''),
      OPTIONS: ({ request, params }) => handle(request, params._splat ?? ''),
      POST: ({ request, params }) => handle(request, params._splat ?? ''),
    },
  },
})
