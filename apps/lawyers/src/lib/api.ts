import { invoke, isTauri } from '@tauri-apps/api/core'
import { queryContext } from './query-context/context'

/**
 * The one client for the application's API. Every call goes to a path under
 * `/api/**`:
 *
 * - in the desktop app it goes through the single `api_request` Tauri command,
 *   which hands it to the router in process (there is no socket);
 * - in a browser during development it goes to the debug-only loopback
 *   listener, which is the same router.
 *
 * Rules (who may decide, what is valid) are enforced by the server on every
 * call. A refusal arrives as an `ApiError` carrying the server's own message,
 * which is written to be shown.
 */

/** Development only: `?api=47935` points this browser tab (and only it) at a
 * second copy of the API, so one dev server can show two computers of a firm. */
function devPort(): number {
  const fallback = Number(import.meta.env.VITE_PLEADLI_DEV_PORT) || 47924
  if (!import.meta.env.DEV || typeof window === 'undefined') return fallback
  try {
    const asked = new URLSearchParams(window.location.search).get('api')
    if (asked && /^\d{4,5}$/.test(asked)) sessionStorage.setItem('pleadli-dev-api', asked)
    return Number(sessionStorage.getItem('pleadli-dev-api')) || fallback
  } catch {
    return fallback
  }
}

const DEV_BASE_URL = `http://127.0.0.1:${devPort()}`

export class ApiError extends Error {
  status: number
  code: string

  constructor(status: number, code: string, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
  }
}

type Query = Record<string, string | number | undefined>

export type ApiOptions = {
  query?: Query
  body?: unknown
}

function withQuery(path: string, query?: Query) {
  if (!query) return path
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== '') params.set(key, String(value))
  }
  const text = params.toString()
  return text ? `${path}?${text}` : path
}

type Wire = { status: number; body: unknown }

async function transport(method: string, path: string, body: unknown): Promise<Wire> {
  if (isTauri()) {
    return invoke<Wire>('api_request', { req: { method, path, body: body ?? null } })
  }
  const response = await fetch(`${DEV_BASE_URL}${path}`, {
    method,
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const text = await response.text()
  let parsed: unknown = null
  if (text) {
    try {
      parsed = JSON.parse(text)
    } catch {
      parsed = text
    }
  }
  return { status: response.status, body: parsed }
}

const lockListeners = new Set<() => void>()

/** Called when the app answers that nobody is signed in (423) or that it is
 * not set up yet (428), so the gate shows at once instead of waiting for the
 * next status poll. */
export function onLocked(listener: () => void) {
  lockListeners.add(listener)
  return () => {
    lockListeners.delete(listener)
  }
}

export async function api(method: 'GET' | 'POST' | 'PUT' | 'DELETE', path: string, options: ApiOptions = {}): Promise<unknown> {
  const { status, body } = await transport(method, withQuery(path, options.query), options.body)
  if (status >= 200 && status < 300) return body

  // A locked app answers every gated route this way, whether the caller is
  // the visible screen or a direct call to this application's own local API.
  // Whatever already sat in memory (a matter, a document) must not still be
  // readable once the app is meant to be locked, so the cache is cleared here
  // too, not only when the advocate locks it themselves through the UI.
  if (status === 423 && !path.startsWith('/api/lock/')) queryContext().removeQueries({ predicate: (q) => q.queryKey[0] !== 'session' && q.queryKey[0] !== 'installation' })
  if (status === 423 || status === 428) lockListeners.forEach((listener) => listener())

  const payload = (body && typeof body === 'object' ? body : {}) as { code?: string; message?: string }
  throw new ApiError(status, payload.code ?? `HTTP_${status}`, payload.message ?? 'The request failed.')
}

/** A path segment from a record id. */
export const seg = encodeURIComponent

/** Empty form strings are "not given". */
export const orNull = (value: string | undefined | null) => (value && value.trim() ? value : null)

/** What to tell the person when a request fails: the server's own words when
 * it refused (they are written to be read), and a plain line otherwise. */
export const messageOf = (error: unknown) => (error instanceof ApiError && error.status < 500 ? error.message : 'Please try again.')
