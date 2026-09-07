import { betterAuth } from 'better-auth'
import { admin, bearer } from 'better-auth/plugins'
import { drizzleAdapter } from '@better-auth/drizzle-adapter'
import { env } from 'cloudflare:workers'
import { db } from '../db'
import * as authSchema from '../db/auth-schema'
import { pleadliOrganizations } from './plugins/organizations'
import { password } from './password'

export const auth = betterAuth({
  baseURL: env.BETTER_AUTH_URL ?? 'http://localhost:3000',
  secret: env.BETTER_AUTH_SECRET,
  database: drizzleAdapter(db, {
    provider: 'sqlite',
    schema: authSchema,
    transaction: false,
  }),
  emailAndPassword: {
    enabled: true,
    password,
  },
  databaseHooks: {
    user: {
      create: {
        before: async (user, ctx) => {
          if (ctx?.path !== "/sign-up/email") {
            return {
              data: user,
            }
          }
          const adapter = ctx.context.adapter
          const count = await adapter.count({ model: "user" })
          return {
            data: {
              ...user,
              role: count > 0 ? "user" : "admin",
            },
          }
        },
      },
    }
  },
  plugins: [
    bearer(),
    admin(),
    pleadliOrganizations(),
  ],
})
