import { api } from '@/lib/api'
import * as z from 'zod'
import { activityItemSchema } from './schema'

export async function listRecentActivity() {
  const items = await api('/activity/recent')
  return z.array(activityItemSchema).parse(items)
}
