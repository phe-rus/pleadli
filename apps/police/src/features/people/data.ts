import { getDb } from '@/db'
import { people } from '@/db/schema'
import { desc, eq, like, or } from 'drizzle-orm'

export type Person = typeof people.$inferSelect

export interface CreatePersonInput {
  firstName: string
  lastName: string
  otherNames?: string
  phone?: string
  nationalId?: string
  address?: string
}

export async function createPerson(input: CreatePersonInput) {
  const db = await getDb()
  const [person] = await db
    .insert(people)
    .values({
      firstName: input.firstName,
      lastName: input.lastName,
      otherNames: input.otherNames || null,
      phone: input.phone || null,
      nationalId: input.nationalId || null,
      address: input.address || null,
    })
    .returning()
  return person
}

export async function listPeople() {
  const db = await getDb()
  return db.select().from(people).orderBy(desc(people.createdAt)).limit(50)
}

export async function searchPeople(query: string) {
  if (!query.trim()) return listPeople()
  const db = await getDb()
  const term = `%${query.trim()}%`
  return db
    .select()
    .from(people)
    .where(
      or(
        like(people.firstName, term),
        like(people.lastName, term),
        like(people.otherNames, term),
        like(people.phone, term),
        like(people.nationalId, term),
      ),
    )
    .orderBy(desc(people.createdAt))
    .limit(50)
}

export async function getPerson(id: string) {
  const db = await getDb()
  const [person] = await db.select().from(people).where(eq(people.id, id)).limit(1)
  return person ?? null
}

export function personFullName(person: Pick<Person, 'firstName' | 'lastName' | 'otherNames'>) {
  return [person.lastName, person.firstName, person.otherNames].filter(Boolean).join(', ')
}
