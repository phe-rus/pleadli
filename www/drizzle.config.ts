import { defineConfig } from 'drizzle-kit'

// Migrations are generated from the schema and applied by wrangler
// (`migrations_dir` in wrangler.jsonc points at the same folder). Nothing here
// touches a database, so no credentials or local file lookups are needed.
export default defineConfig({
  dialect: 'sqlite',
  schema: ['./src/db/auth-schema.ts', './src/db/orchestra-schema.ts', './src/db/relay-schema.ts'],
  out: './.migrations',
})
