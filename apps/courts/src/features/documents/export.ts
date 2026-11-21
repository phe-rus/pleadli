import * as m from '@/paraglide/messages'
import { t } from '@pleadli/ui/goey-toaster'
import { invoke, isTauri } from '@tauri-apps/api/core'
import { documentMarkdown, paperBlocks, readPaper } from './paper'
export type ExportFormat = 'pdf' | 'docx' | 'md'
export const exportFormats = {
  pdf: { label: 'PDF document', mime: 'application/pdf' },
  docx: { label: 'Word document', mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' },
  md: { label: 'Markdown', mime: 'text/markdown;charset=utf-8' },
} as const

export function documentName(title: string, format: ExportFormat) {
  const clean = title.replace(/[^\p{L}\p{N} ._-]/gu, '-').replace(/\s+/g, ' ').trim().replace(/^\.+/, '').slice(0, 100)
  return `${clean || 'Court document'}.${format}`
}

/** Generate genuine file bytes. Heavy renderers are loaded only on demand. */
export async function exportPaper(title: string, paper: Element, format: ExportFormat): Promise<boolean> {
  const blocks = paperBlocks(readPaper(paper))
  const bytes = format === 'md' ? new TextEncoder().encode(documentMarkdown(blocks))
    : format === 'pdf' ? await (await import('./pdf')).documentPdf(title, blocks)
    : await (await import('./word')).documentWord(title, blocks)
  const name = documentName(title, format)
  if (isTauri()) {
    let binary = ''
    for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192))
    const saved = await invoke<string | null>('export_document', { name, format, contentBase64: btoa(binary) })
    if (saved) t.success(m['downloads.saved']({ name: saved.split(/[\\/]/).pop() ?? saved }))
    return saved !== null
  }
  const url = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: exportFormats[format].mime }))
  const link = document.createElement('a')
  link.href = url; link.download = name; link.click()
  setTimeout(() => URL.revokeObjectURL(url), 30_000)
  return true
}
