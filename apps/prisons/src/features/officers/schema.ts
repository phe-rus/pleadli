import * as z from 'zod'

export const officerRoles = [
  { value: 'officer', label: 'Officer' },
  { value: 'admin', label: 'Admin' },
] as const

export function officerRoleLabel(role: string) {
  return officerRoles.find((r) => r.value === role)?.label ?? role
}

export const officerSchema = z.object({
  id: z.string(),
  badgeNumber: z.string(),
  name: z.string(),
  role: z.string(),
  active: z.boolean(),
  createdAt: z.number(),
})

export type Officer = z.infer<typeof officerSchema>

export const officerErrorSchema = z.object({
  code: z.string(),
  message: z.string(),
})

export type OfficerApiError = z.infer<typeof officerErrorSchema>

/** Thrown by every officer/session call whose failure is a real, coded
 * outcome (bad credentials, badge taken, last admin guard), not a
 * transport error — lets a caller branch on `error.code` instead of
 * parsing prose. */
export class OfficerError extends Error {
  code: string
  constructor(payload: OfficerApiError) {
    super(payload.message)
    this.code = payload.code
  }
}

export const createOfficerSchema = z.object({
  badgeNumber: z.string().min(1, 'Badge number is required.'),
  name: z.string().min(1, 'Name is required.'),
  password: z.string().min(8, 'Password must be at least 8 characters.'),
  role: z.string().min(1, 'Role is required.'),
  adminBadgeNumber: z.string().nullable(),
  adminPassword: z.string().nullable(),
})

export type CreateOfficerInput = z.infer<typeof createOfficerSchema>

export const updateOfficerSchema = z.object({
  name: z.string().min(1, 'Name is required.'),
  role: z.string().min(1, 'Role is required.'),
  active: z.boolean(),
  password: z.string().min(8, 'Password must be at least 8 characters.').nullable(),
  adminBadgeNumber: z.string().min(1),
  adminPassword: z.string().min(1),
})

export type UpdateOfficerInput = z.infer<typeof updateOfficerSchema>

/** Head Office's own version of the two schemas above: no admin badge or
 * password fields, since a real signed in session already establishes
 * who is asking (spec: docs/specs/prisons/0001-head-office-peer-sync-
 * network/index.md's cross child contract). */
export const createOfficerTrustedSchema = createOfficerSchema.omit({ adminBadgeNumber: true, adminPassword: true })
export type CreateOfficerTrustedInput = z.infer<typeof createOfficerTrustedSchema>

export const updateOfficerTrustedSchema = updateOfficerSchema.omit({ adminBadgeNumber: true, adminPassword: true })
export type UpdateOfficerTrustedInput = z.infer<typeof updateOfficerTrustedSchema>

export const adminCredentialsSchema = z.object({
  adminBadgeNumber: z.string().min(1, 'Badge number is required.'),
  adminPassword: z.string().min(1, 'Password is required.'),
})

export type AdminCredentials = z.infer<typeof adminCredentialsSchema>
