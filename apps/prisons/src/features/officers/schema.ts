import * as z from 'zod'
import { m } from '@/paraglide/messages'

/** Role templates (docs/prisons/product-map/05 M.2). The permissions each
 * grants are defined once, on the node (`domain/authz.rs`); this list only
 * names them for the screen. The vocabulary is provisional (research R-07). */
export const facilityRoles = [
  { value: 'oic', get label() { return m.officers_officer_in_charge() } },
  { value: 'officer', get label() { return m.officers_officer_general_duty() } },
  { value: 'records', get label() { return m.officers_records_and_reception() } },
  { value: 'facility_admin', get label() { return m.officers_facility_administrator() } },
] as const

export const headOfficeRoles = [
  { value: 'hq_admin', get label() { return m.officers_head_office_administrator() } },
  { value: 'hq_officer', get label() { return m.officers_head_office_officer() } },
  { value: 'hq_commander', get label() { return m.officers_regional_or_district_commander() } },
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
  passwordless: z.boolean(),
})

export type Officer = z.infer<typeof officerSchema>

export const createOfficerSchema = z.object({
  badgeNumber: z.string().min(1, { error: () => m.validation_badge_required() }),
  name: z.string().min(1, { error: () => m.validation_name_required() }),
  // The node owns the secret rules (password, PIN, or none), so it answers
  // with the reason instead of a length guessed here.
  password: z.string(),
  passwordless: z.boolean().optional(),
  role: z.string().min(1, { error: () => m.validation_role_required() }),
  isAdmin: z.boolean(),
  rank: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  email: z.string().nullable().optional(),
  photoData: z.string().nullable().optional(),
  postedFacilityId: z.string().nullable().optional(),
})

export type CreateOfficerInput = z.infer<typeof createOfficerSchema>

export const updateOfficerSchema = z.object({
  name: z.string().min(1, { error: () => m.validation_name_required() }),
  role: z.string().min(1, { error: () => m.validation_role_required() }),
  isAdmin: z.boolean(),
  active: z.boolean(),
  password: z.string().nullable(),
  /** Set only to change it; null leaves badge-only sign-in as it is. */
  passwordless: z.boolean().nullable().optional(),
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
    'auth.login': m.officers_signed_in(),
    'auth.login_failed': m.officers_failed_sign_in_attempt(),
    'auth.logout': m.officers_signed_out(),
    'account.create': m.officers_account_created(),
    'account.update': m.officers_account_updated(),
    'account.update_with_password_change': m.officers_account_updated_password_changed(),
    'account.delete': m.officers_account_deleted(),
    'account.bootstrap': m.officers_first_account_created(),
    'facility.connection_requested': m.officers_asked_to_connect_a_facility(),
    'facility.connection_approved': m.officers_approved_a_facility_connection(),
    'facility.registered': m.officers_facility_registered(),
    'facility.verified': m.officers_facility_verified(),
    'facility.revoked': m.officers_facility_revoked(),
  }
  return known[action] ?? action.replace(/[._]/g, ' ').replace(/^./, (c) => c.toUpperCase())
}

export function officerInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase() || '?'
}
