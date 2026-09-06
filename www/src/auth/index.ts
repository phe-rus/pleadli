import { betterAuth } from 'better-auth'
import { bearer } from 'better-auth/plugins'
import { drizzleAdapter } from '@better-auth/drizzle-adapter'
import { env } from 'cloudflare:workers'
import { db } from '../db'
import * as authSchema from '../db/auth-schema'
import { pleadliOrganizations } from './plugins/organizations'

export const auth = betterAuth({
  // TODO before real deploy: set BETTER_AUTH_URL / BETTER_AUTH_SECRET as real
  // Worker secrets (`wrangler secret put`), not left on the localhost fallback.
  baseURL: env.BETTER_AUTH_URL ?? 'http://localhost:3000',
  secret: env.BETTER_AUTH_SECRET,
  database: drizzleAdapter(db, {
    provider: 'sqlite',
    schema: authSchema,
    // D1 does not support raw SQL transactions (no BEGIN/COMMIT) — see
    // pleadli-d1-dev-gotchas. Sequential writes only.
    transaction: false,
  }),
  emailAndPassword: {
    enabled: true,
  },
  user: {
    additionalFields: {
      // Platform-level role — separate from any institution membership. A
      // platform_admin is not automatically a member of any institution, and
      // an institution member is not automatically a platform_admin. There is
      // no self-serve way to become platform_admin (by design — see
      // pleadli-organizations.ts's createOrganization comment); for now the
      // only way is a direct DB write:
      //   UPDATE user SET role = 'platform_admin' WHERE email = '...';
      role: {
        type: 'string',
        required: false,
        defaultValue: 'user',
        input: false,
      },
    },
  },
  plugins: [
    // Bearer-token auth for the Police/DPP desktop apps, which have no cookie jar.
    bearer(),
    // Pleadli's own organization/institution model — a custom plugin, not the
    // stock `organization` plugin, since institutions need real self-referencing
    // hierarchy (HQ -> Region -> Division -> Station) that the stock plugin has
    // no primitive for. See ./plugins/organizations.ts.
    pleadliOrganizations(),
  ],
})
