import * as z from 'zod'
import { api, orNull, seg } from '@/lib/api'
import { directionSchema } from './schema'

export async function listDirectionsForFile(fileId: string) {
  return z.array(directionSchema).parse(await api('GET', `/api/prosecution-files/${seg(fileId)}/directions`))
}

export async function respondToDirection(id: string, response: string, note: string) {
  return directionSchema.parse(await api('PUT', `/api/directions/${seg(id)}/response`, { body: { response, note: orNull(note) } }))
}
