import { queryOptions, useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { certifyProgrammeParticipation, createProgrammeParticipation, listProgrammeParticipationsForPrisoner } from './data'
import type { CertifyProgrammeParticipationInput, CreateProgrammeParticipationInput } from './schema'

export const programmeParticipationsForPrisonerOptions = (prisonerId: string) =>
  queryOptions({
    queryKey: ['programme-participations', 'prisoner', prisonerId] as const,
    queryFn: () => listProgrammeParticipationsForPrisoner(prisonerId),
  })

export function useProgrammeParticipationsForPrisoner(prisonerId: string) {
  return useSuspenseQuery(programmeParticipationsForPrisonerOptions(prisonerId))
}

export function useCreateProgrammeParticipation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateProgrammeParticipationInput) => createProgrammeParticipation(input),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['programme-participations', 'prisoner', variables.prisonerId] })
    },
  })
}

export function useCertifyProgrammeParticipation(prisonerId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: CertifyProgrammeParticipationInput }) => certifyProgrammeParticipation(id, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['programme-participations', 'prisoner', prisonerId] })
    },
  })
}
