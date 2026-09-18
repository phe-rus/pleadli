import { invoke, isTauri } from '@tauri-apps/api/core'

/**
 * Transfer dossiers and receipts travel between facilities as files. In the
 * desktop app the operating system's own dialogs choose the path (the webview
 * never names one); in a browser during development the fallbacks download and
 * pick through standard browser controls.
 */

export type ExchangeFile = { fileName: string; contentBase64: string }

function base64ToBlob(contentBase64: string) {
  const binary = atob(contentBase64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
  return new Blob([bytes], { type: 'application/octet-stream' })
}

/** Returns where the file was saved, or null if the officer cancelled. */
export async function saveExchangeFile(file: ExchangeFile): Promise<string | null> {
  if (isTauri()) {
    return invoke<string | null>('export_file', { defaultName: file.fileName, contentBase64: file.contentBase64 })
  }
  const url = URL.createObjectURL(base64ToBlob(file.contentBase64))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = file.fileName
  anchor.click()
  URL.revokeObjectURL(url)
  return file.fileName
}

/** Opens a file of one type, for example `pleadli-dossier`. Null if cancelled. */
export async function openExchangeFile(extension: string): Promise<ExchangeFile | null> {
  if (isTauri()) {
    const opened = await invoke<{ name: string; contentBase64: string } | null>('import_file', { extension })
    return opened ? { fileName: opened.name, contentBase64: opened.contentBase64 } : null
  }
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = `.${extension}`
    input.onchange = async () => {
      const file = input.files?.[0]
      if (!file) return resolve(null)
      const bytes = new Uint8Array(await file.arrayBuffer())
      let binary = ''
      const chunk = 0x8000
      for (let i = 0; i < bytes.length; i += chunk) binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
      resolve({ fileName: file.name, contentBase64: btoa(binary) })
    }
    input.oncancel = () => resolve(null)
    input.click()
  })
}
