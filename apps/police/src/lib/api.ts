import { invoke, isTauri } from '@tauri-apps/api/core'

/** Where the development listener answers, for the plain browser dev server. A
 * release build has no listener: the webview reaches the router through the one
 * `api_request` command instead. */
export const DEV_API_URL = 'http://127.0.0.1:47821/api'

const TOKEN_KEY = 'pleadli:police:session'

/** A refusal from the router, carrying the server's own message, which is
 * written to be shown. */
export class ApiError extends Error {
  status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

/** The sign-in token. In the desktop window the shell holds it and the page
 * never sees it; in the browser dev server it lives in session storage. */
let browserToken: string | null = readStoredToken()
const endedListeners = new Set<() => void>()

function readStoredToken() {
  try {
    return sessionStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}

export function setBrowserToken(token: string | null) {
  browserToken = token
  try {
    if (token) sessionStorage.setItem(TOKEN_KEY, token)
    else sessionStorage.removeItem(TOKEN_KEY)
  } catch {
    // Storage may be unavailable; the in-memory token still works.
  }
}

/** Called when the app answers that the sign-in is over (signed out, idle for
 * too long, or the officer was disabled), so the sign-in screen can show at
 * once instead of waiting for the next check. */
export function onSessionEnded(listener: () => void) {
  endedListeners.add(listener)
  return () => {
    endedListeners.delete(listener)
  }
}

type ApiInit = { method?: string; body?: BodyInit | null; headers?: HeadersInit }

function messageOf(body: unknown, fallback: string) {
  return typeof body === 'string' && body ? body : fallback
}

/** The one way the app asks its own backend for JSON. `path` is the route
 * under `/api` (for example `/custody`). In the desktop window the request goes
 * through the router in-process; in the browser dev server it goes to the
 * loopback listener. A refusal (validation, not signed in, not allowed) is an
 * `ApiError`. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function api(path: string, init?: ApiInit): Promise<any> {
  let status: number
  let body: unknown

  if (isTauri()) {
    const parsed = typeof init?.body === 'string' ? JSON.parse(init.body) : null
    const result = await invoke<{ status: number; body: unknown }>('api_request', {
      req: { method: init?.method ?? 'GET', path: `/api${path}`, body: parsed },
    })
    status = result.status
    body = result.body
  } else {
    const headers: Record<string, string> = { 'Content-Type': 'application/json', ...(init?.headers as Record<string, string> | undefined) }
    if (browserToken) headers.Authorization = `Bearer ${browserToken}`
    const response = await fetch(`${DEV_API_URL}${path}`, { ...init, headers })
    status = response.status
    const text = await response.text()
    try {
      body = text ? JSON.parse(text) : null
    } catch {
      body = text
    }
  }

  if (status >= 400) {
    // A 401 anywhere but the sign-in calls themselves means the session is over.
    if (status === 401 && !path.startsWith('/auth/')) {
      setBrowserToken(null)
      endedListeners.forEach((listener) => listener())
    }
    throw new ApiError(status, messageOf(body, typeof body === 'object' && body ? JSON.stringify(body) : 'The request was refused.'))
  }
  return status === 204 ? null : body
}
