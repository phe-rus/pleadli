import { useUsagesEnabled } from '@/features/installation'
import type { Usage } from '@/features/usages'
import { api } from '@/lib/api'
import * as m from '@/paraglide/messages'
import { queryOptions, useQuery } from '@tanstack/react-query'
import * as z from 'zod'

/** The kinds of matter and their stages come from the backend
 * (`domain/matter_types.rs`), so the board and the rules never disagree; only
 * the words for them live here. */
const matterTypeSchema = z.object({ id: z.string(), usage: z.string(), stages: z.array(z.string()) })
export type MatterType = z.infer<typeof matterTypeSchema> & { usage: Usage }

export const matterTypesOptions = () =>
  queryOptions({
    queryKey: ['matter-types'] as const,
    queryFn: async () => z.array(matterTypeSchema).parse(await api('GET', '/api/matter-types')) as MatterType[],
    staleTime: Infinity,
  })

export const useMatterTypes = () => useQuery(matterTypesOptions())

/** The kinds of matter this practice can open: those of its switched-on usages. */
export function useEnabledMatterTypes(): MatterType[] {
  const { data: types } = useMatterTypes()
  const { data: usages } = useUsagesEnabled()
  return (types ?? []).filter((t) => usages?.includes(t.usage))
}

const typeLabels: Record<string, () => string> = {
  civil_suit: () => m["matter_type.civil_suit"](),
  application: () => m["matter_type.application"](),
  criminal_defence: () => m["matter_type.criminal_defence"](),
  appeal: () => m["matter_type.appeal"](),
  land_transaction: () => m["matter_type.land_transaction"](),
  company_matter: () => m["matter_type.company_matter"](),
  family_case: () => m["matter_type.family_case"](),
  succession: () => m["matter_type.succession"](),
  employment_claim: () => m["matter_type.employment_claim"](),
  advice: () => m["matter_type.advice"](),
  government_suit: () => m["matter_type.government_suit"](),
  legal_aid_case: () => m["matter_type.legal_aid_case"](),
  private_prosecution: () => m["matter_type.private_prosecution"](),
}
export const matterTypeLabel = (id: string) => typeLabels[id]?.() ?? id

const stageLabels: Record<string, () => string> = {
  instructions: () => m["stage.instructions"](),
  pre_action: () => m["stage.pre_action"](),
  pleadings: () => m["stage.pleadings"](),
  directions: () => m["stage.directions"](),
  trial: () => m["stage.trial"](),
  judgment: () => m["stage.judgment"](),
  costs_execution: () => m["stage.costs_execution"](),
  filed: () => m["stage.filed"](),
  served: () => m["stage.served"](),
  reply: () => m["stage.reply"](),
  hearing: () => m["stage.hearing"](),
  ruling: () => m["stage.ruling"](),
  custody_bail: () => m["stage.custody_bail"](),
  plea_disclosure: () => m["stage.plea_disclosure"](),
  sentence: () => m["stage.sentence"](),
  appeal: () => m["stage.appeal"](),
  notice: () => m["stage.notice"](),
  record: () => m["stage.record"](),
  memorandum: () => m["stage.memorandum"](),
  due_diligence: () => m["stage.due_diligence"](),
  drafting: () => m["stage.drafting"](),
  signing: () => m["stage.signing"](),
  registration: () => m["stage.registration"](),
  mediation: () => m["stage.mediation"](),
  order: () => m["stage.order"](),
  petition: () => m["stage.petition"](),
  gazetting: () => m["stage.gazetting"](),
  grant: () => m["stage.grant"](),
  distribution: () => m["stage.distribution"](),
  complaint: () => m["stage.complaint"](),
  award: () => m["stage.award"](),
  question: () => m["stage.question"](),
  research: () => m["stage.research"](),
  drafted: () => m["stage.drafted"](),
  delivered: () => m["stage.delivered"](),
  satisfaction: () => m["stage.satisfaction"](),
  intake: () => m["stage.intake"](),
  eligibility: () => m["stage.eligibility"](),
  advice: () => m["stage.advice"](),
  representation: () => m["stage.representation"](),
  sanction: () => m["stage.sanction"](),
  charge: () => m["stage.charge"](),
}
export const stageLabel = (id: string) => stageLabels[id]?.() ?? id

/** Kinds of matter that are proceedings before a court: they carry a court,
 * a court number and hearings. The others (a transaction, advice) do not
 * need those fields in front of them. */
export const inCourt = (type: string) => !['land_transaction', 'company_matter', 'advice'].includes(type)
