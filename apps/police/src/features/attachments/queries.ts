import { queryOptions, useMutation, useQuery, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import {
  addAttachmentFile,
  addAttachmentFromPath,
  bulkAttachFiles,
  clearPersonPhoto,
  deleteAttachment,
  getAttachmentDataUrl,
  getAttachmentRoute,
  listAllAttachments,
  listAttachments,
  setPersonPhoto,
} from './data'
import type { PersonPhotoAngle } from './schema'

export const attachmentsOptions = (entityType: string, entityId: string) =>
  queryOptions({
    queryKey: ['attachments', entityType, entityId] as const,
    queryFn: () => listAttachments(entityType, entityId),
    enabled: Boolean(entityId),
  })

export function useAttachments(entityType: string, entityId: string) {
  return useQuery(attachmentsOptions(entityType, entityId))
}

export function useAddAttachment(entityType: string, entityId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: { path: string } | { file: File }) =>
      'file' in input
        ? addAttachmentFile(entityType, entityId, input.file)
        : addAttachmentFromPath(entityType, entityId, input.path),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['attachments', entityType, entityId] })
    },
  })
}

export const allAttachmentsOptions = (query: string) =>
  queryOptions({
    queryKey: ['attachments', 'all', query] as const,
    queryFn: () => listAllAttachments(query),
  })

export function useAllAttachments(query: string) {
  return useSuspenseQuery(allAttachmentsOptions(query))
}

export function useAttachmentRoute(entityType: string, entityId: string) {
  return useQuery({
    queryKey: ['attachments', 'route', entityType, entityId] as const,
    queryFn: () => getAttachmentRoute(entityType, entityId),
  })
}

export function useAttachmentDataUrl(id: string | null | undefined) {
  return useQuery({
    queryKey: ['attachments', 'dataUrl', id] as const,
    queryFn: () => getAttachmentDataUrl(id!),
    enabled: Boolean(id),
    staleTime: Infinity,
  })
}

export function useDeleteAttachment(entityType: string, entityId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => deleteAttachment(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['attachments', entityType, entityId] })
    },
  })
}

/** Sets one of a person's four identification-photo slots (see
 * `personPhotoAngles`). Invalidates the person's attachments, their
 * profile, and the people search list, since the front slot doubles as the
 * avatar shown in search results and list rows. */
export function useSetPersonPhoto(personId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: { angle: PersonPhotoAngle; path: string } | { angle: PersonPhotoAngle; file: File }) =>
      'file' in input
        ? setPersonPhoto(personId, input.angle, { file: input.file })
        : setPersonPhoto(personId, input.angle, { path: input.path }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['attachments', 'person', personId] })
      queryClient.invalidateQueries({ queryKey: ['people', 'profile', personId] })
      queryClient.invalidateQueries({ queryKey: ['people', 'search'] })
    },
  })
}

/** Bulk paperwork intake: the target entity isn't known until the
 * officer picks it in the intake UI, so (unlike the other mutations
 * here) it's passed per-call rather than bound when the hook is called. */
export function useBulkAttachFiles() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      entityType,
      entityId,
      input,
    }: {
      entityType: string
      entityId: string
      input: { paths: string[] } | { files: File[] }
    }) => bulkAttachFiles(entityType, entityId, input),
    onSuccess: (_data, { entityType, entityId }) => {
      queryClient.invalidateQueries({ queryKey: ['attachments', entityType, entityId] })
    },
  })
}

export function useClearPersonPhoto(personId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (angle: PersonPhotoAngle) => clearPersonPhoto(personId, angle),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['attachments', 'person', personId] })
      queryClient.invalidateQueries({ queryKey: ['people', 'profile', personId] })
      queryClient.invalidateQueries({ queryKey: ['people', 'search'] })
    },
  })
}
