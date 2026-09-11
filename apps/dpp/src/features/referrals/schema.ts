import * as z from 'zod'

export const referralSchema = z.object({
  id: z.string(),
  prosecutionFileId: z.string(),
  policeStation: z.string().nullable(),
  policeReference: z.string().nullable(),
  receivedAt: z.number(),
  materialSummary: z.string().nullable(),
  isResubmission: z.boolean(),
  notes: z.string().nullable(),
  createdAt: z.number(),
})

export type Referral = z.infer<typeof referralSchema>

export const createResubmissionSchema = z.object({
  prosecutionFileId: z.string().min(1),
  policeStation: z.string(),
  policeReference: z.string(),
  receivedAt: z.number(),
  materialSummary: z.string(),
  notes: z.string(),
})

export type CreateResubmissionInput = z.infer<typeof createResubmissionSchema>
