import { api } from '@/lib/api'
import { attentionSchema } from './schema'

export const getAttention = async () => attentionSchema.parse(await api('GET', '/api/attention'))
