import { db } from '@/db'
import { organization, organizationUnit } from '@/db/auth-schema'
import { paper, trackingCode, trackingEvent } from '@/db/orchestra-schema'
import { normaliseCode } from '@/lib/orchestra'
import { asc, eq, inArray } from 'drizzle-orm'

/** The public side of Orchestra (ORCHESTRA-PLAN.md section 8b): anyone with a
 * code learns whether a paper is genuine, or where a case stands. Searching is
 * only ever by a code the person was given, never by name. Shared by the pages
 * (server functions) and the JSON API at /api/public/v1. */

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

export const PUBLIC_FIELDS = ['reference', 'kind', 'office', 'issuedAt'] as const

function chosenFields(raw: string): Set<string> {
  try {
    const parsed = JSON.parse(raw)
    return new Set(Array.isArray(parsed) ? parsed.filter((x) => (PUBLIC_FIELDS as readonly string[]).includes(x)) : [])
  } catch {
    return new Set() // unreadable choice: show nothing optional
  }
}

/** Whether a paper is genuine. Only the fields its institution chose to publish are
 * returned (never the content hash). A withdrawn paper is still found, and says so. */
export async function findPaper(rawCode: string) {
  const code = normaliseCode(rawCode)
  if (code.length < 8) return null
  const [row] = await db
    .select({ p: paper, institution: organization.name })
    .from(paper)
    .innerJoin(organization, eq(organization.id, paper.organizationId))
    .where(eq(paper.code, code))
  if (!row) return null
  const show = chosenFields(row.p.publicFields)
  const names = show.has('office') ? await officeNames([row.p.office]) : new Map<string, string>()
  return {
    code: row.p.code,
    reference: show.has('reference') ? row.p.reference : null,
    kind: show.has('kind') ? row.p.kind : null,
    application: row.p.application,
    institution: row.institution,
    office: show.has('office') ? (names.get(row.p.office) ?? row.institution) : null,
    issuedAt: show.has('issuedAt') ? row.p.issuedAt.getTime() : null,
    withdrawnAt: row.p.withdrawnAt?.getTime() ?? null,
    withdrawnReason: row.p.withdrawnReason,
    supersededByCode: row.p.supersededByCode ?? null,
    // Sent so the visitor's browser can compare a dropped PDF on the spot;
    // the file itself never leaves their device.
    fileSha256: row.p.fileSha256,
    // Pleadli confirms the institution issued this paper through its licensed app.
    // It is not a court or registry record unless that institution is one and says so.
    authority: 'institution_issued' as const,
  }
}

export async function findCase(rawCode: string) {
  const code = normaliseCode(rawCode)
  if (code.length !== 12) return null
  const [tracked] = await db.select().from(trackingCode).where(eq(trackingCode.code, code))
  if (!tracked || tracked.unpublishedAt) return null
  const events = await db.select().from(trackingEvent).where(eq(trackingEvent.code, code)).orderBy(asc(trackingEvent.at))
  const names = await officeNames(events.map((e) => e.office ?? ''))
  return {
    code,
    steps: events.map((e) => ({ stage: e.stage, office: e.office ? (names.get(e.office) ?? null) : null, at: e.at.getTime(), nextAt: e.nextAt?.getTime() ?? null })).reverse(),
  }
}
