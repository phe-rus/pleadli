import { queryOptions, useMutation, useQuery } from '@tanstack/react-query'
import { addSegment, adoptSegment, getTranscriptionStatus, listRecordings, listSegments, removeSegment, transcribe, updateSegment, verifyRecording } from './data'
import type { SegmentInput } from './schema'

export const recordingsOptions = (sittingId: string) => queryOptions({ queryKey: ['recordings', sittingId] as const, queryFn: () => listRecordings(sittingId) })
export const useRecordings = (sittingId: string) => useQuery(recordingsOptions(sittingId))

export const segmentsOptions = (recordingId: string) => queryOptions({ queryKey: ['segments', recordingId] as const, queryFn: () => listSegments(recordingId) })
export const useSegments = (recordingId: string, enabled = true) => useQuery({ ...segmentsOptions(recordingId), enabled })

export const useTranscriptionStatus = () => useQuery({ queryKey: ['transcription', 'status'] as const, queryFn: () => getTranscriptionStatus(), staleTime: Infinity })

export const useVerifyRecording = () => useMutation({ mutationFn: (id: string) => verifyRecording(id) })
export const useTranscribe = () => useMutation({ mutationFn: (id: string) => transcribe(id) })
export const useAddSegment = () => useMutation({ mutationFn: (v: { recordingId: string; input: SegmentInput }) => addSegment(v.recordingId, v.input) })
export const useUpdateSegment = () => useMutation({ mutationFn: (v: { id: string; input: SegmentInput }) => updateSegment(v.id, v.input) })
export const useRemoveSegment = () => useMutation({ mutationFn: (id: string) => removeSegment(id) })
export const useAdoptSegment = () => useMutation({ mutationFn: (v: { id: string; kind: string }) => adoptSegment(v.id, v.kind) })
