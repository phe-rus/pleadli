import { queryOptions, useMutation, useSuspenseQuery } from '@tanstack/react-query'
import { addAppearance, addNote, getSitting, removeAppearance, removeNote, setAttendance, signRecord, takeAppearances, updateNote } from './data'
import type { AttendanceInput, NoteInput } from './schema'

export const sittingOptions = (id: string) => queryOptions({ queryKey: ['sittings', 'detail', id] as const, queryFn: () => getSitting(id) })
export const useSitting = (id: string) => useSuspenseQuery(sittingOptions(id))

export const useTakeAppearances = () => useMutation({ mutationFn: (sittingId: string) => takeAppearances(sittingId) })
export const useAddAppearance = () => useMutation({ mutationFn: (v: { sittingId: string; name: string; role: string }) => addAppearance(v.sittingId, { name: v.name, role: v.role }) })
export const useSetAttendance = () => useMutation({ mutationFn: (v: { id: string; input: AttendanceInput }) => setAttendance(v.id, v.input) })
export const useRemoveAppearance = () => useMutation({ mutationFn: (id: string) => removeAppearance(id) })
export const useAddNote = () => useMutation({ mutationFn: (v: { sittingId: string; input: NoteInput }) => addNote(v.sittingId, v.input) })
export const useUpdateNote = () => useMutation({ mutationFn: (v: { id: string; input: NoteInput }) => updateNote(v.id, v.input) })
export const useRemoveNote = () => useMutation({ mutationFn: (id: string) => removeNote(id) })
export const useSignRecord = () => useMutation({ mutationFn: (sittingId: string) => signRecord(sittingId) })
