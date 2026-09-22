import { api } from '@/lib/api'
import { registerNumberSchema, type RegisterKind } from './schema'

/** What the next number of a register would be. Nothing is taken until the
 * entry itself is saved. */
export async function getNextRegisterNumber(kind: RegisterKind) {
  return registerNumberSchema.parse(await api(`/registers/next?kind=${kind}`))
}
