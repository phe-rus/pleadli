import * as z from 'zod'

export const photoViews = ['front', 'left', 'right'] as const
export type PhotoView = (typeof photoViews)[number]

export const photoViewLabel: Record<PhotoView, string> = { front: 'Front', left: 'Left side', right: 'Right side' }

export const prisonerPhotoSchema = z.object({
  view: z.enum(photoViews),
  attachmentId: z.string(),
  takenAt: z.number(),
})

export type PrisonerPhoto = z.infer<typeof prisonerPhotoSchema>

export const captureSessionSchema = z.object({
  sessionId: z.string(),
  url: z.string(),
  qrSvg: z.string(),
  expiresAt: z.number(),
})

export type CaptureSession = z.infer<typeof captureSessionSchema>

export const captureStatusSchema = z.object({
  expiresAt: z.number(),
  open: z.boolean(),
  photos: z.array(
    z.object({
      photoId: z.string(),
      view: z.enum(photoViews),
      createdAt: z.number(),
      dataUrl: z.string().nullable(),
    }),
  ),
})

export type CaptureStatus = z.infer<typeof captureStatusSchema>
