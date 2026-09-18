import * as z from 'zod'

export const activationErrorSchema = z.object({
  code: z.string(),
  message: z.string(),
})

export type ActivationApiError = z.infer<typeof activationErrorSchema>

/** Thrown by verify_activation_code's one real, coded failure. Always
 * `INVALID_ACTIVATION_CODE`: a bad signature, an expired code, and the
 * clock rollback guard are never distinguished from each other (AC-4). */
export class ActivationError extends Error {
  code: string
  constructor(payload: ActivationApiError) {
    super(payload.message)
    this.code = payload.code
  }
}

export const hqRoleSchema = z.enum(['facility', 'head_office'])
export type HqRole = z.infer<typeof hqRoleSchema>
