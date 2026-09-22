import { api } from '@/lib/api'
import { chainSchema, saveChainSchema, type SaveChainInput } from './schema'

export async function getChain() {
  return chainSchema.parse(await api('/units/chain'))
}

export async function saveChain(input: SaveChainInput) {
  const parsed = saveChainSchema.parse(input)
  return chainSchema.parse(await api('/units/chain', { method: 'PUT', body: JSON.stringify(parsed) }))
}
