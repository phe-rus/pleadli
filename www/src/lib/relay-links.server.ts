import { db } from '@/db'
import { organization, organizationUnit } from '@/db/auth-schema'
import { relayLink, relayMessage } from '@/db/relay-schema'
import { env } from 'cloudflare:workers'
import { and, eq, inArray, or } from 'drizzle-orm'

/** Connections between offices (docs/platform/RELAY-DESIGN.md section 6).
 * A station asks, a named administrator of the other institution decides.
 * An approved connection lets the two offices post to each other, both ways:
 * a referral goes one way and its receipt must come back. */

/** The institution and the display name that own an address, or null. */
export async function whoOwns(address: string) {
  const [org] = await db.select({ id: organization.id, name: organization.name }).from(organization).where(eq(organization.address, address))
  if (org) return { organizationId: org.id, name: org.name }
  const [unit] = await db
    .select({ organizationId: organizationUnit.organizationId, name: organizationUnit.name, org: organization.name })
    .from(organizationUnit)
    .innerJoin(organization, eq(organization.id, organizationUnit.organizationId))
    .where(eq(organizationUnit.address, address))
  return unit ? { organizationId: unit.organizationId, name: `${unit.name}, ${unit.org}` } : null
}

/** Every address one institution owns: its own and its offices'. */
export async function addressesOf(organizationId: string) {
  const [org] = await db.select({ address: organization.address }).from(organization).where(eq(organization.id, organizationId))
  const units = await db.select({ address: organizationUnit.address }).from(organizationUnit).where(eq(organizationUnit.organizationId, organizationId))
  return [org?.address, ...units.map((u) => u.address)].filter((a): a is string => !!a)
}

/** True when an approved connection joins the two addresses, in either direction. */
export async function connected(a: string, b: string) {
  const [row] = await db
    .select({ id: relayLink.id })
    .from(relayLink)
    .where(
      and(
        eq(relayLink.status, 'approved'),
        or(and(eq(relayLink.fromAddress, a), eq(relayLink.toAddress, b)), and(eq(relayLink.fromAddress, b), eq(relayLink.toAddress, a))),
      ),
    )
  return !!row
}

export type LinkAction = 'approve' | 'decline' | 'revoke'

/** Records a person's decision. Approve and decline belong to the office that
 * was asked; revoke to either side. Revoking drops the mail still waiting
 * between the two, so nothing arrives after trust is withdrawn. */
export async function decideLink(organizationId: string, linkId: string, action: LinkAction, decidedBy: string, reason?: string) {
  const [link] = await db.select().from(relayLink).where(eq(relayLink.id, linkId))
  if (!link) throw new Error('No such connection.')
  const [from, to] = await Promise.all([whoOwns(link.fromAddress), whoOwns(link.toAddress)])
  const asked = to?.organizationId === organizationId
  const asking = from?.organizationId === organizationId
  if (!asked && !asking) throw new Error('This connection is not yours to decide.')
  if (action !== 'revoke' && !asked) throw new Error('Only the office that was asked can approve or decline.')
  if (action === 'revoke' ? link.status !== 'approved' && link.status !== 'requested' : link.status !== 'requested') throw new Error('That connection has already been decided.')

  const status = action === 'approve' ? 'approved' : action === 'decline' ? 'declined' : 'revoked'
  await db.update(relayLink).set({ status, decidedBy, reason: reason?.trim() || null, decidedAt: new Date() }).where(eq(relayLink.id, linkId))

  if (status === 'revoked') {
    const waiting = await db
      .select({ id: relayMessage.id, blobKey: relayMessage.blobKey })
      .from(relayMessage)
      .where(
        and(
          or(and(eq(relayMessage.fromAddress, link.fromAddress), eq(relayMessage.toAddress, link.toAddress)), and(eq(relayMessage.fromAddress, link.toAddress), eq(relayMessage.toAddress, link.fromAddress))),
        ),
      )
    const open = waiting.slice(0, 500)
    for (const row of open) await env.POSTBOX.delete(row.blobKey)
    if (open.length) await db.delete(relayMessage).where(inArray(relayMessage.id, open.map((r) => r.id)))
  }
  return { status }
}
