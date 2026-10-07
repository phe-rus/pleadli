import { createContext, useContext, useEffect, type ReactNode } from 'react'
import { PAPER_CSS } from './styles'

/** What the page said when it left the application, recorded by the app's backend. */
export type PaperStamp = { code: string; qr: string | null; printedAt: number }

export type StampInput = {
  entityType: string
  entityId: string
  reference: string | null
  title: string
  body: string
}

export type OfficeApps = { os: 'windows' | 'macos' | 'linux'; word: boolean; excel: boolean; libreOffice: boolean }

export type PaperLabels = {
  preview: string
  edit: string
  print: string
  word: string
  printHint: string
  verifyLine: string
  changedSincePrinted: string
  lastPrinted: (when: string) => string
  saving: string
  failed: string
  tabs: { details: string; history: string; related: string; citations: string }
  latest: string
  copy: string
  copied: string
  noHistory: string
  readVersion: string
  printedBy: (who: string, when: string) => string
  noRelated: string
  cites: string
  citedBy: string
  noCitations: string
  openInWord: string
  openInLibreOffice: string
  openElsewhere: string
  printHintWindows: string
}

export const englishLabels: PaperLabels = {
  preview: 'Preview',
  edit: 'Edit',
  print: 'Print or save as PDF',
  word: 'Save as Word',
  printHint: 'Choose "Save as PDF" in the print window to keep a PDF.',
  verifyLine: 'Check this paper with its code',
  changedSincePrinted: 'Changed since it was last printed',
  lastPrinted: (when) => `Last printed ${when}`,
  saving: 'Preparing the paper',
  failed: 'The paper could not be prepared',
  tabs: { details: 'Document detail', history: 'History', related: 'Related documents', citations: 'Citations' },
  latest: 'This is the latest version of this paper.',
  copy: 'Copy',
  copied: 'Copied',
  noHistory: 'This paper has not left the office yet. Each time it is printed or saved, the version is kept here.',
  readVersion: 'Read this version',
  printedBy: (who, when) => `Printed by ${who}, ${when}`,
  noRelated: 'No other papers on this file belong with this one.',
  cites: 'This paper cites',
  citedBy: 'Cited by',
  noCitations: 'No law or other paper is named in this paper.',
  openInWord: 'Open in Word',
  openInLibreOffice: 'Open in LibreOffice',
  openElsewhere: 'Open in another program',
  printHintWindows: 'To keep a PDF, choose "Microsoft Print to PDF" as the printer.',
}

export type PaperApp = {
  /** Records the wording and returns the code and QR to print. */
  stamp: (input: StampInput) => Promise<PaperStamp>
  /** Every version of this record that left the application, newest first. */
  history?: (entityType: string, entityId: string) => Promise<(PaperStamp & { body: string; title: string; printedBy: string | null })[]>
  /** The last time this record left the application, with the wording it had. */
  lastPrint?: (entityType: string, entityId: string) => Promise<(PaperStamp & { body: string }) | null>
  /** Saves a file where the person chooses. False if they cancelled. */
  saveFile: (name: string, bytes: Uint8Array, mime: string, extension: string) => Promise<boolean>
  /** The office programs on this computer, where the app can tell. */
  office?: () => Promise<OfficeApps>
  /** Opens a file in the program the system uses for it. */
  openFile?: (name: string, bytes: Uint8Array) => Promise<void>
  labels?: Partial<PaperLabels>
  formatDate?: (ms: number) => string
}

const PaperContext = createContext<(PaperApp & { labels: PaperLabels }) | null>(null)

/** One per application, near the root: the app's backend and words for the paper. */
export function PaperProvider({ app, children }: { app: PaperApp; children: ReactNode }) {
  useEffect(() => {
    if (document.getElementById('pleadli-paper-css')) return
    const style = document.createElement('style')
    style.id = 'pleadli-paper-css'
    style.textContent = PAPER_CSS
    document.head.appendChild(style)
  }, [])
  return <PaperContext.Provider value={{ ...app, labels: { ...englishLabels, ...app.labels } }}>{children}</PaperContext.Provider>
}

export function usePaperApp() {
  const app = useContext(PaperContext)
  if (!app) throw new Error('PaperProvider is missing')
  return app
}
