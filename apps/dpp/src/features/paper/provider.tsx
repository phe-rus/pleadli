import { api } from '@/lib/api'
import { formatDate } from '@/lib/dates'
import * as m from '@/paraglide/messages'
import { PaperProvider as SharedPaperProvider, type OfficeApps, type PaperApp, type PaperStamp } from '@pleadli/paper'
import { invoke, isTauri } from '@tauri-apps/api/core'
import { save } from '@tauri-apps/plugin-dialog'
import type { ReactNode } from 'react'

const b64 = (bytes: Uint8Array) => {
  let s = ''
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(s)
}

async function saveFile(name: string, bytes: Uint8Array, mime: string, extension: string) {
  if (isTauri()) {
    const path = await save({ defaultPath: name, filters: [{ name: extension.toUpperCase(), extensions: [extension] }] })
    if (!path) return false
    await invoke('save_paper_file', { path, data: b64(bytes) })
    return true
  }
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: mime }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
  return true
}

/** DPP's backend and words behind every paper. Labels are getters: read per render, in the current language. */
const app: PaperApp = {
  stamp: (input) => api('POST', '/api/prints', { body: input }) as Promise<PaperStamp>,
  history: (entityType, entityId) => api('GET', '/api/prints/history', { query: { entityType, entityId } }) as never,
  lastPrint: (entityType, entityId) => api('GET', '/api/prints/last', { query: { entityType, entityId } }) as Promise<(PaperStamp & { body: string }) | null>,
  saveFile,
  office: async () => (isTauri() ? ((await invoke('office_apps')) as OfficeApps) : { os: 'linux', word: false, excel: false, libreOffice: false }),
  openFile: async (name, bytes) => {
    if (isTauri()) await invoke('open_paper_file', { name, data: b64(bytes) })
  },
  formatDate: (ms) => formatDate(ms),
  get labels() {
    return {
      preview: m["paper.preview"](),
      edit: m["paper.edit"](),
      print: m["paper.print"](),
      word: m["paper.word"](),
      printHint: m["paper.print_hint"](),
      verifyLine: m["paper.verify_line"](),
      changedSincePrinted: m["paper.changed"](),
      lastPrinted: (when: string) => m["paper.last_printed"]({ when }),
      saving: m["paper.saving"](),
      failed: m["paper.failed"](),
      tabs: { details: m["paper.tabs.details"](), history: m["paper.tabs.history"](), related: m["paper.tabs.related"](), citations: m["paper.tabs.citations"]() },
      latest: m["paper.latest"](),
      copy: m["paper.copy"](),
      copied: m["paper.copied"](),
      noHistory: m["paper.no_history"](),
      readVersion: m["paper.read_version"](),
      printedBy: (who: string) => m["paper.printed_by"]({ who }),
      noRelated: m["paper.no_related"](),
      cites: m["paper.cites"](),
      citedBy: m["paper.cited_by"](),
      noCitations: m["paper.no_citations"](),
      openInWord: m["paper.open_word"](),
      openInLibreOffice: m["paper.open_libre"](),
      openElsewhere: m["paper.open_elsewhere"](),
      printHintWindows: m["paper.print_hint_windows"](),
    }
  },
}

export function PaperProvider({ children }: { children: ReactNode }) {
  return <SharedPaperProvider app={app}>{children}</SharedPaperProvider>
}
