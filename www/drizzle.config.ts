import { defineConfig } from 'drizzle-kit'
import path from 'node:path'
import fs from 'node:fs'

const localConfig = () => {
  try {
    const basePath = path.resolve('.wrangler')
    const dbFile = fs
      .readdirSync(basePath, { encoding: 'utf-8', recursive: true })
      .find((f) => f.endsWith('.sqlite'))
    if (!dbFile) throw new Error(`.sqlite file not found in ${basePath}`)
    return path.resolve(basePath, dbFile)
  } catch (err) {
    console.log(`Error  ${err}`)
  }
}

export default defineConfig({
  dialect: 'sqlite',
  schema: './src/db/auth-schema.ts',
  out: './.migrations',
  driver: 'd1-http',
  dbCredentials: {
    url: localConfig() ?? '',
  },
})
