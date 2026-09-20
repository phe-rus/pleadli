import { ugPack } from '@/features/jurisdiction'
import type { AuthMode } from '@/features/auth-policy'
import { m } from '@/paraglide/messages'
import * as z from 'zod'

/** Everything a new facility decides, held in the browser until the last
 * step. Nothing is saved before then, so a setup that is abandoned leaves the
 * installation exactly as it was. */
export type Draft = {
  name: string
  facilityCode: string
  location: string
  region: string
  badgePrefix: string
  numberingPattern: string
  numberingReset: 'yearly' | 'never'
  documentPrefix: string
  adminBadge: string
  adminName: string
  adminPassword: string
  adminPasswordAgain: string
  authMode: AuthMode
}

export const initialDraft: Draft = {
  name: '',
  facilityCode: '',
  location: '',
  region: '',
  badgePrefix: '',
  numberingPattern: ugPack.numbering.pattern,
  numberingReset: ugPack.numbering.reset,
  documentPrefix: '',
  adminBadge: '',
  adminName: '',
  adminPassword: '',
  adminPasswordAgain: '',
  authMode: 'password',
}

/** Zod takes a function so the words are chosen when the check runs, in the
 * language showing then, not when this module loaded. */
const code = (label: () => string, max: number) =>
  z
    .string()
    .trim()
    .regex(new RegExp(`^[A-Za-z0-9\\-/.]{0,${max}}$`), { error: () => m.setup_err_code_format({ label: label(), max }) })

export const identitySchema = z.object({
  name: z.string().trim().min(1, { error: () => m.setup_err_name() }),
  facilityCode: code(() => m.setup_err_code_label_facility(), 20).min(1, { error: () => m.setup_err_code_required() }),
  location: z.string(),
  region: z.string(),
})

export const headOfficeIdentitySchema = z.object({
  name: z.string().trim().min(1, { error: () => m.hqsetup_err_name() }),
  facilityCode: code(() => m.hqsetup_err_code_label(), 20).min(1, { error: () => m.hqsetup_err_code_required() }),
  location: z.string(),
  region: z.string(),
})

export const conventionsSchema = z.object({
  badgePrefix: code(() => m.setup_err_code_label_badge(), 12),
  documentPrefix: code(() => m.setup_err_code_label_document(), 12),
  numberingPattern: z.string().trim().min(1, { error: () => m.setup_err_pattern_required() }),
})

/** Head Office keeps no prisoner numbers, so only the two prefixes apply. */
export const headOfficeConventionsSchema = conventionsSchema.pick({ badgePrefix: true, documentPrefix: true })

export const adminSchema = (badgePrefix: string) =>
  z
    .object({
      adminBadge: z.string().trim().min(1, { error: () => m.setup_err_admin_badge() }),
      adminName: z.string().trim().min(1, { error: () => m.setup_err_admin_name() }),
      adminPassword: z.string().min(8, { error: () => m.setup_err_password_length() }),
      adminPasswordAgain: z.string(),
    })
    .refine((v) => !badgePrefix || v.adminBadge.trim().toUpperCase().startsWith(badgePrefix.trim().toUpperCase()), {
      path: ['adminBadge'],
      error: () => m.setup_err_badge_prefix({ prefix: badgePrefix.trim() }),
    })
    .refine((v) => v.adminPassword === v.adminPasswordAgain, { path: ['adminPasswordAgain'], error: () => m.setup_err_password_match() })

export type FieldErrors = Partial<Record<keyof Draft, string>>

/** The first message for each field, for showing under the field. */
export function errorsOf(result: { success: true } | { success: false; error: z.ZodError }): FieldErrors {
  if (result.success) return {}
  const errors: FieldErrors = {}
  for (const issue of result.error.issues) {
    const key = issue.path[0] as keyof Draft
    errors[key] ??= issue.message
  }
  return errors
}

export const numberingPreviewSchema = z.object({
  valid: z.boolean(),
  message: z.string().nullable(),
  preview: z.array(z.string()),
})
