import { api, seg } from '@/lib/api'
import { queryOptions, useMutation } from '@tanstack/react-query'
import * as z from 'zod'

export const instructionBases = ['1_1', '1_2', '1_3', '1_4'] as const
export type InstructionBasis = (typeof instructionBases)[number]

const itemSchema = z.object({
  id: z.string(),
  position: z.number(),
  onDay: z.number().nullable(),
  itemRef: z.string().nullable(),
  particulars: z.string(),
  disbursement: z.boolean(),
  claimed: z.number(),
  agreed: z.number().nullable(),
  taxed: z.number().nullable(),
})
export type BillItem = z.infer<typeof itemSchema>

export const billSummarySchema = z.object({
  id: z.string(),
  matterId: z.string(),
  against: z.enum(['other_side', 'client']),
  subjectValue: z.number().nullable(),
  instructionBasis: z.enum(instructionBases),
  status: z.enum(['draft', 'lodged', 'taxed']),
  lodgedOn: z.number().nullable(),
  preTaxationOn: z.number().nullable(),
  taxedOn: z.number().nullable(),
  taxingOfficer: z.string().nullable(),
  createdBy: z.string().nullable(),
  createdAt: z.number(),
  claimed: z.number(),
  taxed: z.number(),
})
export type BillSummary = z.infer<typeof billSummarySchema>
export const billSchema = billSummarySchema.extend({ items: z.array(itemSchema), scaleInstructionFee: z.number().nullable() })
export type Bill = z.infer<typeof billSchema>

const fixedSchema = z.object({ item: z.string(), what: z.string(), fee: z.number(), perCopy: z.number().nullable(), hourly: z.boolean() })
const floorSchema = z.object({ item: z.string(), what: z.string(), atLeast: z.number() })
export const scaleSchema = z.object({ fixed: z.array(fixedSchema), floors: z.array(floorSchema), source: z.string() })
export type CostsScale = z.infer<typeof scaleSchema>

export type ItemInput = Omit<BillItem, 'id' | 'position'>
export type BillInput = {
  subjectValue: number | null
  instructionBasis: InstructionBasis
  status: Bill['status']
  lodgedOn: number | null
  preTaxationOn: number | null
  taxedOn: number | null
  taxingOfficer: string | null
  items: ItemInput[]
}

export const billsOptions = (matterId: string) => queryOptions({ queryKey: ['bills', matterId] as const, queryFn: async () => z.array(billSummarySchema).parse(await api('GET', `/api/matters/${seg(matterId)}/bills`)) })
export const billOptions = (id: string) => queryOptions({ queryKey: ['bill', id] as const, queryFn: async () => billSchema.parse(await api('GET', `/api/bills/${seg(id)}`)) })
export const costsScaleOptions = () => queryOptions({ queryKey: ['costs-scale'] as const, queryFn: async () => scaleSchema.parse(await api('GET', '/api/costs/scale')), staleTime: Infinity })

export const useCreateBill = () =>
  useMutation({ mutationFn: async (v: { matterId: string; against: 'other_side' | 'client'; subjectValue: number | null; instructionBasis: InstructionBasis }) => billSchema.parse(await api('POST', `/api/matters/${seg(v.matterId)}/bills`, { body: { against: v.against, subjectValue: v.subjectValue, instructionBasis: v.instructionBasis } })) })
export const useUpdateBill = () => useMutation({ mutationFn: async (v: { id: string; input: BillInput }) => billSchema.parse(await api('PUT', `/api/bills/${seg(v.id)}`, { body: v.input })) })
export const useDeleteBill = () => useMutation({ mutationFn: (id: string) => api('DELETE', `/api/bills/${seg(id)}`) })
