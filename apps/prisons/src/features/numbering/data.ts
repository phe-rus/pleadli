import { api } from '@/lib/api'
import {
  estatePolicySchema,
  numberingViewSchema,
  policyPullResultSchema,
  type NumberingInput,
  type UniformInput,
} from './schema'

export async function getNumbering() {
  return numberingViewSchema.parse(await api('GET', '/api/prisons/numbering'))
}

export async function saveNumbering(body: NumberingInput) {
  return numberingViewSchema.parse(await api('PUT', '/api/prisons/numbering', { body }))
}

export async function saveUniforms(uniforms: UniformInput[]) {
  return numberingViewSchema.parse(await api('PUT', '/api/prisons/numbering/uniforms', { body: { uniforms } }))
}

export async function fetchHeadOfficeDefaults() {
  return policyPullResultSchema.parse(await api('POST', '/api/prisons/numbering/fetch-defaults'))
}

export async function getEstatePolicy() {
  return estatePolicySchema.parse(await api('GET', '/api/hq/estate-policy'))
}

export async function saveEstateNumbering(body: NumberingInput) {
  return estatePolicySchema.parse(await api('PUT', '/api/hq/estate-policy', { body }))
}

export async function saveEstateUniforms(uniforms: UniformInput[]) {
  return estatePolicySchema.parse(await api('PUT', '/api/hq/estate-policy/uniforms', { body: { uniforms } }))
}
