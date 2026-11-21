import { t } from '@pleadli/ui/goey-toaster'
import { api } from '@/lib/api'
import { format } from '@/lib/date'
import { m } from '@/paraglide/messages'
import { PaperProvider as SharedPaperProvider, type OfficeApps, type PaperApp, type PaperStamp } from '@pleadli/paper'
import { invoke, isTauri } from '@tauri-apps/api/core'
import type { ReactNode } from 'react'

const b64 = (bytes: Uint8Array) => {
  let s = ''
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(s)
}
const q = (params: Record<string, string>) => new URLSearchParams(params).toString()

async function saveFile(name: string, bytes: Uint8Array, mime: string, extension: string) {
  if (isTauri()) {
    void extension
    const saved = await invoke<string | null>('export_file', { defaultName: name, contentBase64: b64(bytes) })
    if (saved) t.success(m.downloads_saved({ name: saved.split(/[\\/]/).pop() ?? saved }))
    return saved != null
  }
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: mime }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
  return true
}

/** The prison's backend and words behind every paper. Labels are getters: read per render, in the current language. */
const app: PaperApp = {
  stamp: (input) => api('POST', '/api/prints', { body: input }) as Promise<PaperStamp>,
  lastPrint: (entityType, entityId) => api('GET', `/api/prints/last?${q({ entityType, entityId })}`) as never,
  history: (entityType, entityId) => api('GET', `/api/prints/history?${q({ entityType, entityId })}`) as never,
  ink: {
    load: (entityType, entityId) => api('GET', `/api/prints/ink?${q({ entityType, entityId })}`) as Promise<string | null>,
    save: (entityType, entityId, ink) => api('PUT', '/api/prints/ink', { body: { entityType, entityId, ink } }).then(() => undefined),
  },
  saveFile,
  office: async () => (isTauri() ? ((await invoke('office_apps')) as OfficeApps) : { os: 'linux', word: false, excel: false, libreOffice: false }),
  openFile: async (name, bytes) => {
    if (isTauri()) await invoke('open_paper_file', { name, data: b64(bytes) })
  },
  formatDate: (ms) => format(ms, 'PP'),
  get labels() {
    return {
      preview: m.paper_preview(),
      edit: m.paper_edit(),
      write: m.paper_write(),
      clearWriting: m.paper_clear_writing(),
      writeHint: m.paper_write_hint(),
      print: m.paper_print(),
      word: m.paper_word(),
      printHint: m.paper_print_hint(),
      printHintWindows: m.paper_print_hint_windows(),
      verifyLine: m.paper_verify_line(),
      changedSincePrinted: m.paper_changed(),
      lastPrinted: (when: string) => m.paper_last_printed({ when }),
      saving: m.paper_saving(),
      failed: m.paper_failed(),
      openInWord: m.paper_open_word(),
      openInLibreOffice: m.paper_open_libre(),
      openElsewhere: m.paper_open_elsewhere(),
      tabs: { details: m.paper_tabs_details(), history: m.paper_tabs_history(), related: m.paper_tabs_related(), citations: m.paper_tabs_citations() },
      latest: m.paper_latest(),
      copy: m.paper_copy(),
      copied: m.paper_copied(),
      noHistory: m.paper_no_history(),
      readVersion: m.paper_read_version(),
      printedBy: (who: string) => m.paper_printed_by({ who }),
      noRelated: m.paper_no_related(),
      cites: m.paper_cites(),
      citedBy: m.paper_cited_by(),
      noCitations: m.paper_no_citations(),
    }
  },
}

export function PaperProvider({ children }: { children: ReactNode }) {
  return <SharedPaperProvider app={app}>{children}</SharedPaperProvider>
}
