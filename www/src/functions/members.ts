import { db } from '@/db'
import { orchestraMember } from '@/db/orchestra-schema'
import { redirect } from '@tanstack/react-router'
import { eq, inArray, or } from 'drizzle-orm'

/** Who may act on an institution on /orchestra. Kept out of the server-function
 * files: an export there that is not a server function goes to the browser,
 * and these reach the database. */

/** The signed-in person, or a redirect to sign in. */
export function requireUser(session: { user: { id: string; email: string } } | null) {
  if (!session) throw redirect({ to: '/login', search: { redirect: '/orchestra' } as never })
  return session.user
}

/** The institutions this person manages. An invitation sent to their email
 * becomes active the first time they arrive here signed in with it. */
export async function myMemberships(user: { id: string; email: string }) {
  const email = user.email.trim().toLowerCase()
  const rows = await db
    .select()
    .from(orchestraMember)
    .where(or(eq(orchestraMember.userId, user.id), eq(orchestraMember.email, email)))
  const invited = rows.filter((r) => r.status === 'invited')
  if (invited.length) {
    await db
      .update(orchestraMember)
      .set({ status: 'active', userId: user.id, joinedAt: new Date() })
      .where(inArray(orchestraMember.id, invited.map((r) => r.id)))
  }
  return rows.map((r) => ({ ...r, status: 'active' as const, userId: user.id }))
}

/** The membership that lets this person act on this institution, or an error. */
export async function memberOf(user: { id: string; email: string }, organizationId: string, ownerOnly = false) {
  const memberships = await myMemberships(user)
  const m = memberships.find((r) => r.organizationId === organizationId)
  if (!m || (ownerOnly && m.role !== 'owner')) throw new Error('You do not manage this institution.')
  return m
}
