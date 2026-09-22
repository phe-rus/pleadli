import { api } from '@/lib/api'
import * as z from 'zod'
import {
  createExhibitMovementSchema,
  createExhibitSchema,
  exhibitMovementSchema,
  exhibitSchema,
  type CreateExhibitInput,
  type CreateExhibitMovementInput,
} from './schema'

export async function createExhibit(input: CreateExhibitInput) {
  const parsed = createExhibitSchema.parse(input)
  const exhibit = await api('/exhibits', { method: 'POST', body: JSON.stringify(parsed) })
  return exhibitSchema.parse(exhibit)
}

export async function updateExhibit(id: string, input: CreateExhibitInput) {
  const parsed = createExhibitSchema.parse(input)
  const exhibit = await api(`/exhibits/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(parsed) })
  return exhibitSchema.parse(exhibit)
}

export async function listExhibits(query: string) {
  const exhibits = await api(`/exhibits?query=${encodeURIComponent(query)}`)
  return z.array(exhibitSchema).parse(exhibits)
}

export async function createExhibitMovement(exhibitId: string, input: CreateExhibitMovementInput) {
  const parsed = createExhibitMovementSchema.parse(input)
  const movement = await api(`/exhibits/${encodeURIComponent(exhibitId)}/movements`, {
        method: 'POST',
        body: JSON.stringify(parsed),
      })
  return exhibitMovementSchema.parse(movement)
}

export async function listExhibitMovements(exhibitId: string) {
  const movements = await api(`/exhibits/${encodeURIComponent(exhibitId)}/movements`)
  return z.array(exhibitMovementSchema).parse(movements)
}
