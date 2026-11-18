import { db } from '@/db'
import { organization, organizationUnit } from '@/db/auth-schema'
import { computer, licence } from '@/db/orchestra-schema'
import { eq } from 'drizzle-orm'

/** Who is calling, for the calls a computer makes on behalf of its office
 * (the relay, docs/platform/RELAY-DESIGN.md). A computer proves itself with
 * the token it was given when it activated a licence; only a hash is stored. */

export async function sha256Of(data: BufferSource) {
  const digest = await crypto.subtle.digest('SHA-256', data)
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

export function bearerToken(request: Request) {
  const value = request.headers.get('authorization') ?? ''
  return value.startsWith('Bearer ') ? value.slice(7).trim() : ''
}

export type Caller = {
  computerId: string
  organizationId: string
  /** The Orchestra address this computer sends from and collects for: its
   * office's address, or its institution's when it has no office. */
  address: string
  /** A trial or ended licence can read its own mailbox but cannot post. */
  licensed: boolean
}

/** Null when the token is missing or unknown. */
export async function identify(request: Request): Promise<Caller | null> {
  const token = bearerToken(request)
  if (!token) return null
  const hash = await sha256Of(new TextEncoder().encode(token))
  const [row] = await db.select().from(computer).where(eq(computer.tokenHash, hash))
  if (!row?.organizationId) return null

  const [org] = await db.select({ address: organization.address, status: organization.status }).from(organization).where(eq(organization.id, row.organizationId))
  if (!org?.address) return null
  let address = org.address
  if (row.unitId) {
    const [unit] = await db.select({ address: organizationUnit.address }).from(organizationUnit).where(eq(organizationUnit.id, row.unitId))
    if (unit?.address) address = unit.address
  }

  let licensed = false
  if (row.licenceId && org.status === 'active') {
    const [found] = await db.select({ status: licence.status, expiresAt: licence.expiresAt }).from(licence).where(eq(licence.id, row.licenceId))
    licensed = !!found && found.status === 'active' && found.expiresAt > new Date()
  }
  return { computerId: row.id, organizationId: row.organizationId, address, licensed }
}
