import { db } from '@/db'
import { relayLink, relayMessage } from '@/db/relay-schema'
import { addressesOf, decideLink, whoOwns } from '@/lib/relay-links.server'
import { SessionMiddleware } from '@/middlewares/session'
import { createServerFn } from '@tanstack/react-start'
import { and, count, desc, gt, inArray, isNull, or } from 'drizzle-orm'
import * as z from 'zod'
import { memberOf, requireUser } from './members'

/** The Postbox page of Pleadli Account: who wants to connect, who is
 * connected, and how much mail is waiting. Never the contents of any mail
 * (the relay does not hold readable contents). */
export const getPostbox = createServerFn({ method: 'GET' })
  .middleware([SessionMiddleware])
  .validator(z.object({ organizationId: z.string().min(1) }))
  .handler(async ({ data, context }) => {
    const user = requireUser(context.session)
    await memberOf(user, data.organizationId)
    const mine = await addressesOf(data.organizationId)
    if (!mine.length) return { links: [], waiting: 0 }
    const rows = await db
      .select()
      .from(relayLink)
      .where(or(inArray(relayLink.fromAddress, mine), inArray(relayLink.toAddress, mine)))
      .orderBy(desc(relayLink.createdAt))
      .limit(200)
    const links = await Promise.all(
      rows.map(async (r) => {
        const asking = mine.includes(r.fromAddress)
        const other = asking ? r.toAddress : r.fromAddress
        return {
          id: r.id,
          address: other,
          name: (await whoOwns(other))?.name ?? other,
          direction: asking ? ('asked' as const) : ('asked_of_us' as const),
          status: r.status as 'requested' | 'approved' | 'declined' | 'revoked',
          reason: r.reason,
          createdAt: r.createdAt.getTime(),
        }
      }),
    )
    const [waiting] = await db
      .select({ n: count() })
      .from(relayMessage)
      .where(and(inArray(relayMessage.toAddress, mine), isNull(relayMessage.ackedAt), gt(relayMessage.expiresAt, new Date())))
    return { links, waiting: waiting?.n ?? 0 }
  })

export const decideConnection = createServerFn({ method: 'POST' })
  .middleware([SessionMiddleware])
  .validator(z.object({ organizationId: z.string().min(1), linkId: z.string().min(1), action: z.enum(['approve', 'decline', 'revoke']), reason: z.string().trim().max(300).optional() }))
  .handler(async ({ data, context }) => {
    const user = requireUser(context.session)
    await memberOf(user, data.organizationId)
    // Ending a connection tells the other office why, so a person must say. Declining and approving need no reason.
    if (data.action === 'revoke' && !data.reason) throw new Error('Say why the connection is being ended.')
    return decideLink(data.organizationId, data.linkId, data.action, user.email, data.reason)
  })
