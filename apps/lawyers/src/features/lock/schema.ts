import * as z from 'zod'

export const lockStatusSchema = z.object({
  enabled: z.boolean(),
  locked: z.boolean(),
  cooldownRemaining: z.number().nullable(),
})
export type LockStatus = z.infer<typeof lockStatusSchema>

export const recoveryCodeSchema = z.object({ recoveryCode: z.string() })

const pinField = z.string().min(6, 'A PIN needs to be at least 6 characters.').max(64, 'A PIN can be at most 64 characters.')

export const setupSchema = z.object({ pin: pinField })
export type SetupInput = z.infer<typeof setupSchema>

export const unlockSchema = z.object({ pin: z.string().min(1, 'Enter your PIN.') })
export type UnlockInput = z.infer<typeof unlockSchema>

export const disableSchema = z.object({ pin: z.string().min(1, 'Enter your PIN.') })
export type DisableInput = z.infer<typeof disableSchema>

export const recoverSchema = z.object({
  recoveryCode: z.string().min(1, 'Enter your recovery code.'),
  newPin: pinField,
})
export type RecoverInput = z.infer<typeof recoverSchema>
