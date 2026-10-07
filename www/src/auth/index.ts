import { betterAuth } from 'better-auth'
import { admin, bearer } from 'better-auth/plugins'
import { drizzleAdapter } from '@better-auth/drizzle-adapter'
import { env } from 'cloudflare:workers'
import { db } from '../db'
import * as authSchema from '../db/auth-schema'
import { password } from './password'
import { templates } from '@pleadli/templates'
import { institutions } from '@pleadli/institution'

/** Pleadli staff addresses (Worker variable PLEADLI_STAFF_EMAILS, comma
 * separated); pleadli@pleadli.com when it is not set. */
function staffEmails() {
  const configured = (env as { PLEADLI_STAFF_EMAILS?: string }).PLEADLI_STAFF_EMAILS
  return (configured ?? 'pleadli@pleadli.com').split(',').map((e) => e.trim().toLowerCase()).filter(Boolean)
}

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
          // Pleadli staff are named, never "whoever signs up first": an empty
          // database would otherwise hand the admin role to a stranger.
          return {
            data: {
              ...user,
              role: staffEmails().includes(user.email.trim().toLowerCase()) ? "admin" : "user",
            },
          }
        },
      },
    }
  },
  plugins: [
    bearer(),
    admin(),
    templates(),
    institutions(),
  ],
})
