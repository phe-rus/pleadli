import * as z from 'zod'

export const officerRoles = [
  { value: 'officer', label: 'Officer' },
  { value: 'admin', label: 'Admin' },
] as const

export function officerRoleLabel(role: string) {
  return officerRoles.find((r) => r.value === role)?.label ?? role
}

/** Suggestions for a standing post, never enforced: a station can have any
 * number of officers in any posts. These are the verified sub-county staffing
 * roles (docs/police/PRODUCT.md). */
export const officerPostSuggestions = [
  'OC Station',
  'OC CID',
  'Crime Intelligence Officer',
  'Child & Family Protection Officer',
  'Community Liaison Officer',
  'General Officer',
] as const

export const officerSchema = z.object({
  id: z.string(),
  badgeNumber: z.string().nullable(),
  name: z.string(),
  rank: z.string().nullable(),
  post: z.string().nullable(),
  role: z.string(),
  active: z.boolean(),
  personId: z.string().nullable(),
  notes: z.string().nullable(),
  hasSignIn: z.boolean(),
  createdAt: z.number(),
})

export type Officer = z.infer<typeof officerSchema>

const officerFields = {
  badgeNumber: z.string(),
  name: z.string().min(1, 'Name is required.'),
  rank: z.string(),
  post: z.string(),
  role: z.string().min(1, 'Role is required.'),
  notes: z.string(),
  personId: z.string().nullable(),
}

const passwordRule = z.string().min(8, 'Password must be at least 8 characters.')

export const createOfficerSchema = z
  .object({ ...officerFields, password: z.string() })
  .refine((v) => !v.password.trim() || v.badgeNumber.trim(), { message: 'A badge number is needed to sign in.', path: ['badgeNumber'] })
  .refine((v) => !v.password.trim() || passwordRule.safeParse(v.password).success, {
    message: 'Password must be at least 8 characters.',
    path: ['password'],
  })

export type CreateOfficerInput = z.infer<typeof createOfficerSchema>

export const updateOfficerSchema = z
  .object({ ...officerFields, active: z.boolean(), password: z.string().nullable() })
  .refine((v) => !v.password || v.badgeNumber.trim(), { message: 'A badge number is needed to sign in.', path: ['badgeNumber'] })
  .refine((v) => !v.password || passwordRule.safeParse(v.password).success, {
    message: 'Password must be at least 8 characters.',
    path: ['password'],
  })

export type UpdateOfficerInput = z.infer<typeof updateOfficerSchema>

/** The name an officer is shown by: rank and name, as on a roster. */
export function officerDisplay(officer: Pick<Officer, 'name' | 'rank'>) {
  return [officer.rank, officer.name].filter(Boolean).join(' ')
}

export const remoteAccessLogEntrySchema = z.object({
  id: z.string(),
  officerId: z.string(),
  officerName: z.string(),
  action: z.string(),
  detail: z.string().nullable(),
  occurredAt: z.number(),
})

export type RemoteAccessLogEntry = z.infer<typeof remoteAccessLogEntrySchema>

export const remoteAccessSettingsSchema = z.object({
  enabled: z.boolean(),
})

export type RemoteAccessSettings = z.infer<typeof remoteAccessSettingsSchema>

export const backupAlertSchema = z.object({
  id: z.string(),
  officerId: z.string(),
  officerName: z.string(),
  latitude: z.number().nullable(),
  longitude: z.number().nullable(),
  acknowledged: z.boolean(),
  responderOfficerId: z.string().nullable(),
  responderName: z.string().nullable(),
  respondedAt: z.number().nullable(),
  endedAt: z.number().nullable(),
  createdAt: z.number(),
})

export type BackupAlert = z.infer<typeof backupAlertSchema>

export function backupAlertStatus(alert: BackupAlert): 'active' | 'responding' | 'ended' {
  if (alert.endedAt != null) return 'ended'
  if (alert.respondedAt != null) return 'responding'
  return 'active'
}

export function backupAlertMapUrl(alert: BackupAlert) {
  if (alert.latitude == null || alert.longitude == null) return null
  return `https://www.openstreetmap.org/?mlat=${alert.latitude}&mlon=${alert.longitude}#map=16/${alert.latitude}/${alert.longitude}`
}
