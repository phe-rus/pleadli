import Database from '@tauri-apps/plugin-sql'

let dbPromise: Promise<Database> | undefined

async function migrate(db: Database) {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS cases (
      id TEXT PRIMARY KEY,
      complainant TEXT NOT NULL,
      location TEXT NOT NULL,
      description TEXT NOT NULL,
      synced_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `)
}

export function getDb() {
  if (!dbPromise) {
    dbPromise = Database.load('sqlite:police.db').then(async (db) => {
      await migrate(db)
      return db
    })
  }
  return dbPromise
}

export interface CaseRecord {
  id: string
  complainant: string
  location: string
  description: string
  synced_at: string | null
  created_at: string
}

export async function createCase(input: { complainant: string; location: string; description: string }) {
  const db = await getDb()
  const id = crypto.randomUUID()
  await db.execute('INSERT INTO cases (id, complainant, location, description) VALUES ($1, $2, $3, $4)', [
    id,
    input.complainant,
    input.location,
    input.description,
  ])
  return id
}

export async function listCases() {
  const db = await getDb()
  return db.select<CaseRecord[]>('SELECT * FROM cases ORDER BY created_at DESC')
}
