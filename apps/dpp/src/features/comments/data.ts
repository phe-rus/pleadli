import * as z from 'zod'
import { api, orNull } from '@/lib/api'
import { commentSchema, createCommentSchema, type CreateCommentInput } from './schema'

export async function createComment(input: CreateCommentInput) {
  const parsed = createCommentSchema.parse(input)
  return commentSchema.parse(await api('POST', '/api/comments', { body: { ...parsed, author: orNull(parsed.author) } }))
}

export async function listCommentsForEntity(entityType: string, entityId: string) {
  return z.array(commentSchema).parse(await api('GET', '/api/comments', { query: { entityType, entityId } }))
}
