import * as m from '@/paraglide/messages'
import { t } from '@pleadli/ui/goey-toaster'
import { invoke } from '@tauri-apps/api/core'

/** The path a saved paper takes: the computer's Downloads folder, under a name that is free there.
 * No Save window: one click saves, and the officer is told where it went. */
export async function downloadPath(fileName: string): Promise<string> {
  return invoke<string>('downloads_path', { fileName })
}

/** Tells the officer a file was saved and where. */
export function saidSaved(path: string) {
  const name = path.split(/[\\/]/).pop() ?? path
  t.success(m['common.saved_to_downloads']({ name }))
}
