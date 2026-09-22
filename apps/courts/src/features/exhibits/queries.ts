import { useMutation } from '@tanstack/react-query'
import { markExhibit, removeExhibit, updateExhibit } from './data'
import type { MarkExhibitInput, UpdateExhibitInput } from './schema'

export const useMarkExhibit = () => useMutation({ mutationFn: (v: { caseId: string; input: MarkExhibitInput }) => markExhibit(v.caseId, v.input) })
export const useUpdateExhibit = () => useMutation({ mutationFn: (v: { id: string; input: UpdateExhibitInput }) => updateExhibit(v.id, v.input) })
export const useRemoveExhibit = () => useMutation({ mutationFn: (id: string) => removeExhibit(id) })
