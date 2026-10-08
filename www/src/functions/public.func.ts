import { db } from '@/db'
import { organization, organizationUnit } from '@/db/auth-schema'
import { paper, trackingCode, trackingEvent } from '@/db/orchestra-schema'
import { normaliseCode } from '@/lib/orchestra'
import { createServerFn } from '@tanstack/react-start'
import { asc, eq, inArray } from 'drizzle-orm'
import * as z from 'zod'

/** The public side of Orchestra (ORCHESTRA-PLAN.md section 8b): anyone with a
 * code learns whether a paper is genuine, or where a case stands. Searching is
 * only ever by a code the person was given, never by name. */

/** Names of offices by their Orchestra address, from institutions and their offices. */
async function officeNames(addresses: string[]) {
  const wanted = [...new Set(addresses.filter(Boolean))]
  if (!wanted.length) return new Map<string, string>()
  const [orgs, units] = await Promise.all([
    db.select({ address: organization.address, name: organization.name }).from(organization).where(inArray(organization.address, wanted)),
    db.select({ address: organizationUnit.address, name: organizationUnit.name }).from(organizationUnit).where(inArray(organizationUnit.address, wanted)),
  ])
  return new Map([...orgs, ...units].filter((r) => r.address).map((r) => [r.address!, r.name]))
}

const codeInput = z.object({ code: z.string().max(40).transform(normaliseCode) })

export const verifyPaper = createServerFn({ method: 'GET' })
  .validator(codeInput)
  .handler(async ({ data }) => {
    if (data.code.length < 8) return null
    const [row] = await db
      .select({ p: paper, institution: organization.name })
      .from(paper)
      .innerJoin(organization, eq(organization.id, paper.organizationId))
      .where(eq(paper.code, data.code))
    if (!row) return null
    const names = await officeNames([row.p.office])
    return {
      code: row.p.code,
      reference: row.p.reference,
      kind: row.p.kind,
      application: row.p.application,
      institution: row.institution,
      office: names.get(row.p.office) ?? row.institution,
      issuedAt: row.p.issuedAt.getTime(),
      withdrawnAt: row.p.withdrawnAt?.getTime() ?? null,
      withdrawnReason: row.p.withdrawnReason,
      // Sent so the visitor's browser can compare a dropped PDF on the spot;
      // the file itself never leaves their device.
      fileSha256: row.p.fileSha256,
    }
  })

export const trackCase = createServerFn({ method: 'GET' })
  .validator(codeInput)
  .handler(async ({ data }) => {
    if (data.code.length !== 12) return null
    const [code] = await db.select().from(trackingCode).where(eq(trackingCode.code, data.code))
    if (!code) return null
    const events = await db.select().from(trackingEvent).where(eq(trackingEvent.code, data.code)).orderBy(asc(trackingEvent.at))
    const names = await officeNames(events.map((e) => e.office ?? ''))
    return {
      code: data.code,
      steps: events.map((e) => ({ stage: e.stage, office: e.office ? (names.get(e.office) ?? null) : null, at: e.at.getTime(), nextAt: e.nextAt?.getTime() ?? null })).reverse(),
    }
  })
