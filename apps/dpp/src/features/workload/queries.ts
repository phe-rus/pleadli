import { queryOptions, useSuspenseQuery } from '@tanstack/react-query'
import { getCapacity, getWorkload, listActivity, listChronology, listMaterial } from './data'
import type { MaterialKind } from './schema'

export const workloadOptions = () => queryOptions({ queryKey: ['workload'] as const, queryFn: getWorkload })
export const useWorkload = () => useSuspenseQuery(workloadOptions())

export const activityOptions = (limit = 30) => queryOptions({ queryKey: ['activity', limit] as const, queryFn: () => listActivity(limit) })
export const useActivity = (limit = 30) => useSuspenseQuery(activityOptions(limit))

export const chronologyOptions = (fileId: string) => queryOptions({ queryKey: ['chronology', fileId] as const, queryFn: () => listChronology(fileId) })
export const useChronology = (fileId: string) => useSuspenseQuery(chronologyOptions(fileId))

export const materialOptions = (kind: MaterialKind) => queryOptions({ queryKey: ['material', kind] as const, queryFn: () => listMaterial(kind) })
export const useMaterial = (kind: MaterialKind) => useSuspenseQuery(materialOptions(kind))

export const capacityOptions = (months: number) => queryOptions({ queryKey: ['capacity', months] as const, queryFn: () => getCapacity(months) })
export const useCapacity = (months: number) => useSuspenseQuery(capacityOptions(months))
