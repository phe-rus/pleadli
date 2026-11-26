import * as z from 'zod'

/** What the person signed in may do. Decided in the backend
 * (domain/capabilities.rs): administering the installation and prosecuting are
 * separate, so being an administrator says nothing about the rest. */
export const capabilitiesSchema = z.object({
  registerFiles: z.boolean(),
  allocateFiles: z.boolean(),
  reassignFiles: z.boolean(),
  selfAssign: z.boolean(),
  reviewFiles: z.boolean(),
  approveDirectorDecisions: z.boolean(),
  administer: z.boolean(),
})
export type Capabilities = z.infer<typeof capabilitiesSchema>

export const CAPABILITY_KEYS = ['register_files', 'allocate_files', 'reassign_files', 'self_assign', 'review_files'] as const
export type CapabilityKey = (typeof CAPABILITY_KEYS)[number]
export const ROLE_KEYS = ['administrator', 'prosecutor', 'clerk'] as const
export type RoleKey = (typeof ROLE_KEYS)[number]

export const grantSchema = z.object({
  role: z.enum(ROLE_KEYS),
  capability: z.enum(CAPABILITY_KEYS),
  granted: z.boolean(),
  updatedBy: z.string().nullable(),
  updatedAt: z.number(),
})
export type Grant = z.infer<typeof grantSchema>
