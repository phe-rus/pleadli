import { invoke, isTauri } from '@tauri-apps/api/core'

/**
 * The one client for the node API (docs/prisons/product-map/04, "The /api/**
 * namespace"). Every call goes to a path under `/api/**`:
 *
 * - in the desktop app it goes through the single `api_request` Tauri
 *   command, which hands it to the node in process (no socket);
 * - in a browser during development it goes to the debug-only loopback
 *   listener, which is the same router and needs the same sign-in.
 *
 * The session token lives here and is attached to every request. Nothing in
 * the UI decides who may do what: the node does, on every call, and answers
 * 401 or 403 when the answer is no.
 */

const DEV_BASE_URL = 'http://127.0.0.1:47922'
const TOKEN_KEY = 'pleadli:prisons:session'

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

let token: string | null = readStoredToken()
const listeners = new Set<() => void>()

function readStoredToken() {
  try {
    return sessionStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}

export function getSessionToken() {
  return token
}

export function setSessionToken(next: string | null) {
  token = next
  try {
    if (next) sessionStorage.setItem(TOKEN_KEY, next)
    else sessionStorage.removeItem(TOKEN_KEY)
  } catch {
    // Storage can be unavailable; the in-memory token still works.
  }
  listeners.forEach((listener) => listener())
}

/** Called whenever the session token changes or the node reports the
 * session is no longer valid, so the app can return to the sign-in screen. */
export function onSessionChange(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

let reachable = true
const reachabilityListeners = new Set<() => void>()

function setReachable(next: boolean) {
  if (reachable === next) return
  reachable = next
  reachabilityListeners.forEach((listener) => listener())
}

/** Whether the facility node this workstation uses answered the last call.
 * Always true on a machine that is its own node. */
export function isNodeReachable() {
  return reachable
}

export function onReachabilityChange(listener: () => void) {
  reachabilityListeners.add(listener)
  return () => {
    reachabilityListeners.delete(listener)
  }
}

type Query = Record<string, string | undefined>

export type ApiOptions = {
  query?: Query
  body?: unknown
}

function withQuery(path: string, query?: Query) {
  if (!query) return path
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== '') params.set(key, value)
  }
  const text = params.toString()
  return text ? `${path}?${text}` : path
}

type Wire = { status: number; body: unknown }

async function transport(method: string, path: string, body: unknown): Promise<Wire> {
  const headers: Record<string, string> = {}
  if (token) headers.authorization = `Bearer ${token}`

  if (isTauri()) {
    return invoke<Wire>('api_request', { req: { method, path, headers, body: body ?? null } })
  }

  const response = await fetch(`${DEV_BASE_URL}${path}`, {
    method,
    headers: { ...headers, 'content-type': 'application/json' },
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

export async function api(method: 'GET' | 'POST' | 'PUT' | 'DELETE', path: string, options: ApiOptions = {}): Promise<unknown> {
  const { status, body } = await transport(method, withQuery(path, options.query), options.body)
  if (status === 502 && (body as { code?: string } | null)?.code === 'NODE_UNREACHABLE') setReachable(false)
  else setReachable(true)
  if (status >= 200 && status < 300) return body

  const payload = (body && typeof body === 'object' ? body : {}) as { code?: string; message?: string }
  const code = payload.code ?? `HTTP_${status}`
  const message = payload.message ?? (typeof body === 'string' && body ? body : 'The request failed.')

  // The node no longer accepts this session (signed out elsewhere, deactivated,
  // idle timeout). Drop it so the sign-in screen appears.
  if (status === 401 && code === 'UNAUTHENTICATED' && token) setSessionToken(null)

  throw new ApiError(status, code, message)
}
