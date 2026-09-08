import Database from '@tauri-apps/plugin-sql'
import { drizzle } from 'drizzle-orm/sqlite-proxy'
import { seedIfEmpty } from './seed'

let dbPromise: Promise<ReturnType<typeof createDrizzle>> | undefined

async function migrate(raw: Database) {
  await raw.execute(`
    CREATE TABLE IF NOT EXISTS people (
      id TEXT PRIMARY KEY,
      first_name TEXT NOT NULL,
      last_name TEXT NOT NULL,
      other_names TEXT,
      phone TEXT,
      national_id TEXT,
      address TEXT,
      created_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer))
    )
  `)
}

function createDrizzle(raw: Database) {
  return drizzle(async (sqlText, params, method) => {
    if (method === 'run') {
      await raw.execute(sqlText, params)
      return { rows: [] }
    }
    // Tauri's plugin-sql returns rows as column-keyed objects; drizzle's
    // sqlite-proxy row mapper expects positional arrays in column order,
    // same as every other sqlite driver it supports.
    const rows = await raw.select<Record<string, unknown>[]>(sqlText, params)
    return { rows: rows.map((row) => Object.values(row)) }
  })
}

export function getDb() {
  if (!dbPromise) {
    dbPromise = Database.load('sqlite:police.db').then(async (raw) => {
      await migrate(raw)
      const db = createDrizzle(raw)
      await seedIfEmpty(db)
      return db
    })
  }
  return dbPromise
}
