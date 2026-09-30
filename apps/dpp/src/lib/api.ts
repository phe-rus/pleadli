import { invoke, isTauri } from '@tauri-apps/api/core'
import * as m from '@/paraglide/messages'

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

const DEV_BASE_URL = `http://127.0.0.1:${Number(import.meta.env.VITE_PLEADLI_DEV_PORT) || 47921}`

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

/** Called when the app answers that it is locked, so the lock screen can show
 * at once instead of waiting for the next status poll. */
export function onLocked(listener: () => void) {
  lockListeners.add(listener)
  return () => {
    lockListeners.delete(listener)
  }
}

export async function api(method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE', path: string, options: ApiOptions = {}): Promise<unknown> {
  const { status, body } = await transport(method, withQuery(path, options.query), options.body)
  if (status >= 200 && status < 300) return body

  const payload = (body && typeof body === 'object' ? body : {}) as { code?: string; message?: string }
  // Locked, or not set up yet: the gate re-reads the status and takes over.
  if (status === 423 || status === 428) lockListeners.forEach((listener) => listener())
  throw new ApiError(status, payload.code ?? `HTTP_${status}`, payload.message ?? m["common.request_failed"]())
}

/** A path segment from a record id. */
export const seg = encodeURIComponent

/** Empty form strings are "not given". */
export const orNull = (value: string | undefined | null) => (value && value.trim() ? value : null)

/** Where an uploaded file goes in the browser dev server (the desktop app
 * picks files through the operating system instead). */
export const devUploadUrl = `${DEV_BASE_URL}/api/attachments`
export const devAttachmentUrl = (id: string) => `${DEV_BASE_URL}/api/attachments/${encodeURIComponent(id)}/file`

export const devExportUrl = (id: string, format: string) => `${DEV_BASE_URL}/api/documents/${encodeURIComponent(id)}/export/${encodeURIComponent(format)}`

export const devBackupCreateUrl = `${DEV_BASE_URL}/api/backups/create`

export const devInterchangeInviteUrl = (id: string) => `${DEV_BASE_URL}/api/interchange/connections/${encodeURIComponent(id)}/invite`
export const devInterchangeOutgoingUrl = (id: string) => `${DEV_BASE_URL}/api/interchange/outgoing/${encodeURIComponent(id)}/file`
