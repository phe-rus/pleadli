import { api } from '@/lib/api'
import { connectSchema, linkSchema, type ConnectInput } from './schema'

export async function getLink() {
  return linkSchema.parse(await api('/command-link'))
}

export async function connectToCommand(input: ConnectInput) {
  const parsed = connectSchema.parse(input)
  const body = { address: parsed.address.trim(), stationNumber: parsed.stationNumber.trim(), activationCode: parsed.activationCode.trim() || null }
  return linkSchema.parse(await api('/command-link', { method: 'POST', body: JSON.stringify(body) }))
}

export async function disconnectFromCommand() {
  await api('/command-link', { method: 'DELETE' })
}
