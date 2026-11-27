import * as z from 'zod'

export const ROOT = 'root'

export const libraryEntrySchema = z.object({
  id: z.string(),
  kind: z.enum(['folder', 'file']),
  name: z.string(),
  folderId: z.string(),
  sizeBytes: z.number().nullable(),
  mimeType: z.string().nullable(),
  modifiedAt: z.number(),
  itemCount: z.number().nullable(),
  path: z.string().nullable(),
})
export type LibraryEntry = z.infer<typeof libraryEntrySchema>

export const libraryListingSchema = z.object({
  folderId: z.string(),
  crumbs: z.array(z.object({ id: z.string(), name: z.string() })),
  entries: z.array(libraryEntrySchema),
})
export type LibraryListing = z.infer<typeof libraryListingSchema>

export const importResultSchema = z.object({ files: z.number(), folders: z.number(), failed: z.array(z.string()) })
export type ImportResult = z.infer<typeof importResultSchema>

/** How a file is named in the vault viewer: its id and extension, as the Files page does. */
export function vaultPathOf(entry: Pick<LibraryEntry, 'id' | 'name'>) {
  const dot = entry.name.lastIndexOf('.')
  return `library/${entry.id}${dot > 0 ? entry.name.slice(dot) : ''}`
}

/** The id the library route uses for the recycle bin in place of a folder. */
export const BIN = 'bin'

export const binEntrySchema = z.object({
  id: z.string(),
  kind: z.enum(['folder', 'file']),
  name: z.string(),
  fromPath: z.string(),
  sizeBytes: z.number().nullable(),
  itemCount: z.number().nullable(),
  deletedAt: z.number(),
  expiresAt: z.number(),
})
export type BinEntry = z.infer<typeof binEntrySchema>
