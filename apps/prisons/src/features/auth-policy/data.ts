import { api } from '@/lib/api'
import { authPolicySchema, type AuthPolicyInput } from './schema'

export async function getAuthPolicy() {
  return authPolicySchema.parse(await api('GET', '/api/system/auth-policy'))
}

export async function saveAuthPolicy(input: AuthPolicyInput) {
  return authPolicySchema.parse(await api('PUT', '/api/system/auth-policy', { body: input }))
}
