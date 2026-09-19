import * as z from 'zod'
import { api } from '@/lib/api'
import {
  approvedVisitorSchema,
  createVisitSchema,
  visitItemSchema,
  visitListItemSchema,
  visitorSchema,
  visitRulesSchema,
  visitSchema,
  type CheckInInput,
  type CreateVisitInput,
  type NewVisitorInput,
  type SaveVisitRulesInput,
} from './schema'

const blankToNull = (value: string | undefined) => (value && value.trim() ? value.trim() : null)

function newVisitorBody(visitor: NewVisitorInput) {
  return {
    fullName: visitor.fullName,
    idType: visitor.idType,
    idNumber: blankToNull(visitor.idNumber),
    phone: blankToNull(visitor.phone),
    relationship: blankToNull(visitor.relationship),
  }
}

export async function createVisit(input: CreateVisitInput) {
  const parsed = createVisitSchema.parse(input)
  const body = {
    prisonerId: parsed.prisonerId,
    visitorId: parsed.visitorId ?? null,
    newVisitor: parsed.newVisitor ? newVisitorBody(parsed.newVisitor) : null,
    ...(parsed.visitorName ? { visitorName: parsed.visitorName } : {}),
    visitorIdentification: blankToNull(parsed.visitorIdentification),
    relationship: blankToNull(parsed.relationship),
    visitedAt: parsed.visitedAt,
    durationMinutes: parsed.durationMinutes ?? null,
    partySize: parsed.partySize ?? null,
    supervisingOfficer: blankToNull(parsed.supervisingOfficer),
    notes: blankToNull(parsed.notes),
    visitType: parsed.visitType,
    status: parsed.status ?? null,
    authorizedBy: blankToNull(parsed.authorizedBy),
    overLimitReason: blankToNull(parsed.overLimitReason),
  }
  return visitSchema.parse(await api('POST', '/api/prisons/visits', { body }))
}

export async function listVisitsForPrisoner(prisonerId: string) {
  const rows = await api('GET', `/api/prisons/prisoners/${encodeURIComponent(prisonerId)}/visits`)
  return z.array(visitSchema).parse(rows)
}

export async function listVisits(query: string) {
  return z.array(visitListItemSchema).parse(await api('GET', '/api/prisons/visits', { query: { query } }))
}

export async function listVisitItems(visitId: string) {
  return z.array(visitItemSchema).parse(await api('GET', `/api/prisons/visits/${encodeURIComponent(visitId)}/items`))
}

export type VisitAction = 'approve' | 'deny' | 'check-in' | 'start' | 'complete' | 'no-show' | 'cancel'

export async function runVisitAction(id: string, action: VisitAction, body?: unknown) {
  return visitSchema.parse(await api('POST', `/api/prisons/visits/${encodeURIComponent(id)}/${action}`, { body: body ?? {} }))
}

export const checkInVisit = (id: string, input: CheckInInput) => runVisitAction(id, 'check-in', input)

export async function getVisitRules() {
  return visitRulesSchema.parse(await api('GET', '/api/prisons/visit-rules'))
}

export async function saveVisitRules(input: SaveVisitRulesInput) {
  return visitRulesSchema.parse(await api('PUT', '/api/prisons/visit-rules', { body: input }))
}

export async function searchVisitors(query: string) {
  return z.array(visitorSchema).parse(await api('GET', '/api/prisons/visitors', { query: { query } }))
}

export async function listApprovedVisitors(prisonerId: string) {
  return z.array(approvedVisitorSchema).parse(await api('GET', `/api/prisons/prisoners/${encodeURIComponent(prisonerId)}/visitors`))
}

export async function approveVisitor(prisonerId: string, input: { visitorId?: string; newVisitor?: NewVisitorInput; relationship?: string }) {
  const body = {
    visitorId: input.visitorId ?? null,
    newVisitor: input.newVisitor ? newVisitorBody(input.newVisitor) : null,
    relationship: blankToNull(input.relationship),
    note: null,
  }
  return approvedVisitorSchema.parse(await api('POST', `/api/prisons/prisoners/${encodeURIComponent(prisonerId)}/visitors`, { body }))
}

export async function setVisitorStatus(prisonerId: string, visitorId: string, status: 'active' | 'suspended', note?: string) {
  return approvedVisitorSchema.parse(
    await api('POST', `/api/prisons/prisoners/${encodeURIComponent(prisonerId)}/visitors/${encodeURIComponent(visitorId)}/status`, {
      body: { status, note: blankToNull(note) },
    }),
  )
}
