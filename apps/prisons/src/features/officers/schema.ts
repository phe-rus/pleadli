import * as z from 'zod'

/** Role templates (docs/prisons/product-map/05 M.2). The permissions each
 * grants are defined once, on the node (`domain/authz.rs`); this list only
 * names them for the screen. The vocabulary is provisional (research R-07). */
export const facilityRoles = [
  { value: 'oic', label: 'Officer in Charge' },
  { value: 'officer', label: 'Officer (general duty)' },
  { value: 'records', label: 'Records and reception' },
  { value: 'facility_admin', label: 'Facility administrator' },
] as const

export const headOfficeRoles = [
  { value: 'hq_admin', label: 'Head Office administrator' },
  { value: 'hq_officer', label: 'Head Office officer' },
  { value: 'hq_commander', label: 'Regional or District Commander' },
] as const

export function officerRoles(headOffice: boolean) {
  return headOffice ? headOfficeRoles : facilityRoles
}

export function officerRoleLabel(role: string) {
  return [...facilityRoles, ...headOfficeRoles].find((r) => r.value === role)?.label ?? role
}

export const officerSchema = z.object({
  id: z.string(),
  badgeNumber: z.string(),
  name: z.string(),
  role: z.string(),
  isAdmin: z.boolean(),
  active: z.boolean(),
  createdAt: z.number(),
  rank: z.string().nullable(),
  phone: z.string().nullable(),
  email: z.string().nullable(),
  photoData: z.string().nullable(),
  postedFacilityId: z.string().nullable(),
  lastLoginAt: z.number().nullable(),
})

export type Officer = z.infer<typeof officerSchema>

export const createOfficerSchema = z.object({
  badgeNumber: z.string().min(1, 'Badge number is required.'),
  name: z.string().min(1, 'Name is required.'),
  password: z.string().min(8, 'Password must be at least 8 characters.'),
  role: z.string().min(1, 'Role is required.'),
  isAdmin: z.boolean(),
  rank: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  email: z.string().nullable().optional(),
  photoData: z.string().nullable().optional(),
  postedFacilityId: z.string().nullable().optional(),
})

export type CreateOfficerInput = z.infer<typeof createOfficerSchema>

export const updateOfficerSchema = z.object({
  name: z.string().min(1, 'Name is required.'),
  role: z.string().min(1, 'Role is required.'),
  isAdmin: z.boolean(),
  active: z.boolean(),
  password: z.string().min(8, 'Password must be at least 8 characters.').nullable(),
  rank: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  email: z.string().nullable().optional(),
  photoData: z.string().nullable().optional(),
  postedFacilityId: z.string().nullable().optional(),
})

export type UpdateOfficerInput = z.infer<typeof updateOfficerSchema>

export const auditRowSchema = z.object({
  seq: z.number(),
  id: z.string(),
  at: z.number(),
  actorId: z.string().nullable(),
  actorBadge: z.string().nullable(),
  actorName: z.string(),
  action: z.string(),
  entityType: z.string(),
  entityId: z.string().nullable(),
  reason: z.string().nullable(),
})

export type OfficerActivity = z.infer<typeof auditRowSchema>

/** Plain-language names for the audit actions an account profile is likely to show. */
export function activityLabel(action: string) {
  const known: Record<string, string> = {
    'auth.login': 'Signed in',
    'auth.login_failed': 'Failed sign-in attempt',
    'auth.logout': 'Signed out',
    'account.create': 'Account created',
    'account.update': 'Account updated',
    'account.update_with_password_change': 'Account updated, password changed',
    'account.delete': 'Account deleted',
    'account.bootstrap': 'First account created',
    'facility.connection_requested': 'Asked to connect a facility',
    'facility.connection_approved': 'Approved a facility connection',
    'facility.registered': 'Facility registered',
    'facility.verified': 'Facility verified',
    'facility.revoked': 'Facility revoked',
  }
  return known[action] ?? action.replace(/[._]/g, ' ').replace(/^./, (c) => c.toUpperCase())
}

export function officerInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase() || '?'
}
