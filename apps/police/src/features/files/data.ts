import { DEV_API_URL } from '@/lib/api'
import { invoke, isTauri } from '@tauri-apps/api/core'
import * as z from 'zod'
import { vaultEntrySchema, type VaultEntry } from './schema'

const DEV_SERVER_URL = DEV_API_URL

export async function listVaultDirectory(relativePath: string) {
  const entries = isTauri()
    ? await invoke('list_vault_directory', { relativePath })
    : await (await fetch(`${DEV_SERVER_URL}/vault?relativePath=${encodeURIComponent(relativePath)}`)).json()
  return z.array(vaultEntrySchema).parse(entries)
}

/** Opens a file with the OS default application (Tauri) or, in the browser
 * dev server, through the API's file route. The window only ever names the
 * file by its place in the vault; the app resolves where that is on disk. */
export async function openVaultEntry(entry: VaultEntry) {
  if (isTauri()) {
    await invoke('open_vault_path', { relativePath: entry.relativePath })
    return
  }
  if (entry.attachmentId) window.open(`${DEV_SERVER_URL}/attachments/${encodeURIComponent(entry.attachmentId)}/file`, '_blank')
}

export async function revealVaultEntry(entry: VaultEntry) {
  if (!isTauri()) return
  await invoke('reveal_vault_path', { relativePath: entry.relativePath })
}
