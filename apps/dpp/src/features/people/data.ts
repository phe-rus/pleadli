import * as z from 'zod'
import { api, orNull, seg } from '@/lib/api'
import { createPersonSchema, personSchema, type CreatePersonInput } from './schema'

function toApiInput(input: CreatePersonInput) {
  return {
    ...input,
    otherNames: orNull(input.otherNames),
    phone: orNull(input.phone),
    nationalId: orNull(input.nationalId),
    address: orNull(input.address),
  }
}

export async function createPerson(input: CreatePersonInput) {
  const body = toApiInput(createPersonSchema.parse(input))
  return personSchema.parse(await api('POST', '/api/people', { body }))
}

export async function updatePerson(id: string, input: CreatePersonInput) {
  const body = toApiInput(createPersonSchema.parse(input))
  return personSchema.parse(await api('PUT', `/api/people/${seg(id)}`, { body }))
}

export async function searchPeople(query: string) {
  return z.array(personSchema).parse(await api('GET', '/api/people', { query: { query } }))
}
