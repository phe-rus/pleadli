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
})

export type Officer = z.infer<typeof officerSchema>

export const createOfficerSchema = z.object({
  badgeNumber: z.string().min(1, 'Badge number is required.'),
  name: z.string().min(1, 'Name is required.'),
  password: z.string().min(8, 'Password must be at least 8 characters.'),
  role: z.string().min(1, 'Role is required.'),
  isAdmin: z.boolean(),
})

export type CreateOfficerInput = z.infer<typeof createOfficerSchema>

export const updateOfficerSchema = z.object({
  name: z.string().min(1, 'Name is required.'),
  role: z.string().min(1, 'Role is required.'),
  isAdmin: z.boolean(),
  active: z.boolean(),
  password: z.string().min(8, 'Password must be at least 8 characters.').nullable(),
})

export type UpdateOfficerInput = z.infer<typeof updateOfficerSchema>
