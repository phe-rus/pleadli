import { api, seg } from '@/lib/api'
import * as z from 'zod'
import { audioSchema, checkSchema, chunkSchema, recordingSchema, segmentSchema, transcriptionStatusSchema, type SegmentInput } from './schema'

export async function listRecordings(sittingId: string) {
  return z.array(recordingSchema).parse(await api('GET', `/api/sittings/${seg(sittingId)}/recordings`))
}

export async function startRecording(sittingId: string, mimeType: string) {
  return recordingSchema.parse(await api('POST', `/api/sittings/${seg(sittingId)}/recordings`, { body: { mimeType } }))
}

export async function sendChunk(recordingId: string, chunk: { seq: number; offsetMs: number; durationMs: number; dataBase64: string }) {
  return chunkSchema.parse(await api('POST', `/api/recordings/${seg(recordingId)}/chunks`, { body: chunk }))
}

export async function stopRecording(recordingId: string) {
  return recordingSchema.parse(await api('POST', `/api/recordings/${seg(recordingId)}/stop`))
}

export async function verifyRecording(recordingId: string) {
  return checkSchema.parse(await api('GET', `/api/recordings/${seg(recordingId)}/verify`))
}

export async function getAudio(recordingId: string) {
  return audioSchema.parse(await api('GET', `/api/recordings/${seg(recordingId)}/audio`))
}

export async function getTranscriptionStatus() {
  return transcriptionStatusSchema.parse(await api('GET', '/api/transcription/status'))
}

export async function transcribe(recordingId: string) {
  return z.array(segmentSchema).parse(await api('POST', `/api/recordings/${seg(recordingId)}/transcribe`))
}

export async function listSegments(recordingId: string) {
  return z.array(segmentSchema).parse(await api('GET', `/api/recordings/${seg(recordingId)}/segments`))
}

export async function addSegment(recordingId: string, input: SegmentInput) {
  return segmentSchema.parse(await api('POST', `/api/recordings/${seg(recordingId)}/segments`, { body: input }))
}

export async function updateSegment(id: string, input: SegmentInput) {
  return segmentSchema.parse(await api('PUT', `/api/segments/${seg(id)}`, { body: input }))
}

export async function removeSegment(id: string) {
  await api('DELETE', `/api/segments/${seg(id)}`)
}

export async function adoptSegment(id: string, kind: string) {
  return segmentSchema.parse(await api('POST', `/api/segments/${seg(id)}/adopt`, { body: { kind } }))
}
