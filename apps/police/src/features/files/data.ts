import { invoke, isTauri } from '@tauri-apps/api/core'
import * as z from 'zod'
import { vaultEntrySchema, type VaultEntry } from './schema'

const DEV_SERVER_URL = 'http://127.0.0.1:47821'

export async function listVaultDirectory(relativePath: string) {
  const entries = isTauri()
    ? await invoke('list_vault_directory', { relativePath })
    : await (await fetch(`${DEV_SERVER_URL}/vault?relativePath=${encodeURIComponent(relativePath)}`)).json()
  return z.array(vaultEntrySchema).parse(entries)
}

/** Opens a file with the OS default application (Tauri) or in a new
 * browser tab pointed at its absolute path (dev fallback) — the same
 * approach `features/attachments`'s `openAttachment` already uses. */
export async function openVaultEntry(entry: VaultEntry) {
  if (isTauri()) {
    const { openPath } = await import('@tauri-apps/plugin-opener')
    await openPath(entry.absolutePath)
    return
  }
  window.open(`file://${entry.absolutePath}`, '_blank')
}

export async function revealVaultEntry(entry: VaultEntry) {
  if (!isTauri()) return
  const { revealItemInDir } = await import('@tauri-apps/plugin-opener')
  await revealItemInDir(entry.absolutePath)
}
