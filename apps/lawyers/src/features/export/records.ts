import { api } from '@/lib/api'
import { strToU8, zipSync } from 'fflate'

type Row = Record<string, unknown>

function cell(value: unknown): string {
  if (value == null) return ''
  const text = typeof value === 'object' ? JSON.stringify(value) : String(value)
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

/** A table as CSV that Excel and LibreOffice open as it is (BOM for UTF-8). */
function csv(rows: Row[]): string {
  const columns = [...new Set(rows.flatMap((r) => Object.keys(r)))]
  return '﻿' + [columns.join(','), ...rows.map((r) => columns.map((c) => cell(r[c])).join(','))].join('\r\n') + '\r\n'
}

/** Every record of the practice as one ZIP: `records.json` (everything, to
 * move to another program) and one spreadsheet per table. */
export async function buildRecordsZip(): Promise<{ bytes: Uint8Array; name: string }> {
  const data = (await api('GET', '/api/export')) as { tables: Record<string, Row[]> }
  const files: Record<string, Uint8Array> = { 'records.json': strToU8(JSON.stringify(data, null, 2)) }
  for (const [table, rows] of Object.entries(data.tables)) {
    if (rows.length > 0) files[`spreadsheets/${table}.csv`] = strToU8(csv(rows))
  }
  const day = new Date().toISOString().slice(0, 10)
  return { bytes: zipSync(files, { level: 6 }), name: `pleadli-lawyers-records-${day}.zip` }
}
