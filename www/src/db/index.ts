import { drizzle } from 'drizzle-orm/d1'
import { env } from 'cloudflare:workers'
import * as authSchema from './auth-schema'

export const db = drizzle(env.DB, { schema: authSchema })
