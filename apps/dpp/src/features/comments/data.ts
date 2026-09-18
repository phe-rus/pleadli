import { invoke, isTauri } from '@tauri-apps/api/core'
import * as z from 'zod'
import { commentSchema, createCommentSchema, type CreateCommentInput } from './schema'

const DEV_SERVER_URL = 'http://127.0.0.1:47921'

async function devFetch(path: string, init?: RequestInit) {
  const response = await fetch(`${DEV_SERVER_URL}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  })
  if (!response.ok) throw new Error(await response.text())
  return response.status === 204 ? null : response.json()
}

export async function createComment(input: CreateCommentInput) {
  const parsed = createCommentSchema.parse(input)
  const rustInput = { ...parsed, author: parsed.author || null }
  const comment = isTauri()
    ? await invoke('create_comment', { input: rustInput })
    : await devFetch('/comments', { method: 'POST', body: JSON.stringify(rustInput) })
  return commentSchema.parse(comment)
}

export async function listCommentsForEntity(entityType: string, entityId: string) {
  const comments = isTauri()
    ? await invoke('list_comments_for_entity', { entityType, entityId })
    : await devFetch(`/comments?entityType=${encodeURIComponent(entityType)}&entityId=${encodeURIComponent(entityId)}`)
  return z.array(commentSchema).parse(comments)
}
