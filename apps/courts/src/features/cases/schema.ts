import * as z from 'zod'
import { adjournmentSchema, sittingSchema } from '../sittings/schema'
import { orderSummarySchema } from '../orders/schema'
import { exhibitSchema } from '../exhibits/schema'
import { rulingSummarySchema } from '../rulings/schema'

export const caseViews = [
  { id: 'open', label: 'Open cases', about: 'Every case still before the court.' },
  { id: 'unscheduled', label: 'No next date', about: 'Open cases with no sitting fixed. Each one needs a date.' },
  { id: 'concluded', label: 'Concluded', about: 'Cases the court has finished with.' },
  { id: 'all', label: 'All cases', about: 'Every case registered here, open or concluded.' },
] as const
export type CaseViewId = (typeof caseViews)[number]['id']
export const isCaseView = (value: unknown): value is CaseViewId => caseViews.some((v) => v.id === value)

export const courtLevels = [
  { id: 'magistrate', label: 'Magistrates court' },
  { id: 'high', label: 'High Court' },
] as const
export const courtLevelLabel = (id: string) => courtLevels.find((l) => l.id === id)?.label ?? id

export const roles = [
  { id: 'accused', label: 'Accused' },
  { id: 'complainant', label: 'Complainant' },
  { id: 'prosecutor', label: 'Prosecutor' },
  { id: 'defence_counsel', label: 'Defence counsel' },
] as const
export const roleLabel = (id: string) => roles.find((r) => r.id === id)?.label ?? id

export const custodyOptions = [
  { id: 'remanded', label: 'Remanded' },
  { id: 'on_bail', label: 'On bail' },
  { id: 'not_in_custody', label: 'Not in custody' },
] as const
export const custodyLabel = (id: string) => custodyOptions.find((c) => c.id === id)?.label ?? id

export const caseSchema = z.object({
  id: z.string(),
  courtNumber: z.string(),
  title: z.string(),
  courtLevel: z.string(),
  offence: z.string().nullable(),
  registeredOn: z.number().nullable(),
  status: z.string(),
  outcome: z.string().nullable(),
  concludedAt: z.number().nullable(),
  notes: z.string().nullable(),
  createdAt: z.number(),
  updatedAt: z.number(),
})
export type Case = z.infer<typeof caseSchema>

export const caseSummarySchema = z.object({
  id: z.string(),
  courtNumber: z.string(),
  title: z.string(),
  courtLevel: z.string(),
  offence: z.string().nullable(),
  status: z.string(),
  outcome: z.string().nullable(),
  accused: z.string().nullable(),
  nextSittingAt: z.number().nullable(),
  adjournments: z.number(),
  createdAt: z.number(),
})
export type CaseSummary = z.infer<typeof caseSummarySchema>

export const partySchema = z.object({
  id: z.string(),
  caseId: z.string(),
  role: z.string(),
  name: z.string(),
  custody: z.string().nullable(),
  remandUntil: z.number().nullable(),
  custodyPlace: z.string().nullable(),
  note: z.string().nullable(),
  createdAt: z.number(),
})
export type Party = z.infer<typeof partySchema>

export const caseDetailSchema = z.object({
  case: caseSchema,
  parties: z.array(partySchema),
  sittings: z.array(sittingSchema),
  adjournments: z.array(adjournmentSchema),
  orders: z.array(orderSummarySchema),
  exhibits: z.array(exhibitSchema),
  rulings: z.array(rulingSummarySchema),
})
export type CaseDetail = z.infer<typeof caseDetailSchema>

export type CaseInput = {
  courtNumber: string
  title: string
  courtLevel: string
  offence: string | null
  registeredOn: number | null
  notes: string | null
}

export const caseFormSchema = z.object({
  courtNumber: z.string().trim().min(1, 'Enter the number the court registry gave the case.'),
  title: z.string().trim().min(1, 'Enter a title, for example the State against the accused.'),
  courtLevel: z.enum(['magistrate', 'high']),
})

export type PartyInput = {
  role: string
  name: string
  custody: string | null
  remandUntil: number | null
  custodyPlace: string | null
  note: string | null
}

export const partyFormSchema = z.object({
  role: z.string().min(1, 'Choose a role.'),
  name: z.string().trim().min(1, 'Enter a name.'),
})

/** The label a case is known by across the app: its number and title. */
export const caseLabel = (c: { courtNumber: string; title: string }) => `${c.courtNumber}, ${c.title}`
