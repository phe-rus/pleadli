import { api } from '@/lib/api'
import * as z from 'zod'
import { createMedicalExamSchema, medicalExamSchema, type CreateMedicalExamInput } from './schema'

export async function createMedicalExam(input: CreateMedicalExamInput) {
  const parsed = createMedicalExamSchema.parse(input)
  return medicalExamSchema.parse(await api('/medical', { method: 'POST', body: JSON.stringify(parsed) }))
}

export async function updateMedicalExam(id: string, input: CreateMedicalExamInput) {
  const parsed = createMedicalExamSchema.parse(input)
  return medicalExamSchema.parse(await api(`/medical/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(parsed) }))
}

export async function listMedicalExams(query: string) {
  return z.array(medicalExamSchema).parse(await api(`/medical?query=${encodeURIComponent(query)}`))
}
