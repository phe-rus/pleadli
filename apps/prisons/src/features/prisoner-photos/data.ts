import * as z from 'zod'
import { api } from '@/lib/api'
import { captureSessionSchema, captureStatusSchema, prisonerPhotoSchema, type PhotoView } from './schema'

export async function listPrisonerPhotos(prisonerId: string) {
  return z.array(prisonerPhotoSchema).parse(await api('GET', `/api/prisons/prisoners/${encodeURIComponent(prisonerId)}/photos`))
}

export async function savePrisonerPhoto(prisonerId: string, view: PhotoView, dataUrl: string) {
  return prisonerPhotoSchema.parse(await api('PUT', `/api/prisons/prisoners/${encodeURIComponent(prisonerId)}/photos/${view}`, { body: { dataUrl } }))
}

export async function openCaptureSession() {
  return captureSessionSchema.parse(await api('POST', '/api/prisons/capture-sessions'))
}

export async function getCaptureStatus(sessionId: string, known: string[]) {
  return captureStatusSchema.parse(
    await api('GET', `/api/prisons/capture-sessions/${encodeURIComponent(sessionId)}`, { query: { known: known.join(',') } }),
  )
}

export async function closeCaptureSession(sessionId: string) {
  await api('DELETE', `/api/prisons/capture-sessions/${encodeURIComponent(sessionId)}`)
}
