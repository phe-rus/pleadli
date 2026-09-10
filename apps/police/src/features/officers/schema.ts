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
  personId: z.string().nullable(),
  createdAt: z.number(),
})

export type Officer = z.infer<typeof officerSchema>

export const createOfficerSchema = z.object({
  badgeNumber: z.string().min(1, 'Badge number is required.'),
  name: z.string().min(1, 'Name is required.'),
  password: z.string().min(8, 'Password must be at least 8 characters.'),
  role: z.string().min(1, 'Role is required.'),
  personId: z.string().nullable(),
})

export type CreateOfficerInput = z.infer<typeof createOfficerSchema>

export const updateOfficerSchema = z.object({
  name: z.string().min(1, 'Name is required.'),
  role: z.string().min(1, 'Role is required.'),
  active: z.boolean(),
  password: z.string().min(8, 'Password must be at least 8 characters.').nullable(),
  personId: z.string().nullable(),
})

export type UpdateOfficerInput = z.infer<typeof updateOfficerSchema>

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
