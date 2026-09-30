import { getAttachmentDataUrl } from '@/features/attachments/data'
import type { FileItem } from '@/features/file-index/data'
import { kindLabel } from '@/features/file-index/file-index'
import { formatDate } from '@/lib/dates'
import { activeJurisdiction, packText, referenceLabel } from '@/lib/jurisdiction'
import * as m from '@/paraglide/messages'
import { sectionFor } from '@pleadli/setup'
import { invoke, isTauri } from '@tauri-apps/api/core'
import { save } from '@tauri-apps/plugin-dialog'
import { openUrl } from '@tauri-apps/plugin-opener'
import { PDFDocument, rgb, StandardFonts, type PDFFont, type PDFPage } from 'pdf-lib'

const A4: [number, number] = [595.28, 841.89]
const MARGIN = 56

export type CaseFileInput = {
  officeName: string | null
  logo: string | null
  file: { title: string; odppRegistrationNumber: string | null; policeReference: string | null; courtCaseNumber: string | null; policeStation: string | null; receivedAt: number }
  accused: string[]
  offences: string[]
  items: FileItem[]
}

/** Characters the standard PDF fonts cannot draw become a plain stand-in. */
function safe(font: PDFFont, text: string) {
  let out = ''
  for (const ch of text.replace(/\t/g, '    ')) {
    try {
      font.encodeText(ch)
      out += ch
    } catch {
      out += ch === '’' || ch === '‘' ? "'" : '?'
    }
  }
  return out
}

function wrap(font: PDFFont, text: string, size: number, width: number) {
  const lines: string[] = []
  for (const para of safe(font, text).split('\n')) {
    let line = ''
    for (const word of para.split(/\s+/)) {
      const next = line ? `${line} ${word}` : word
      if (font.widthOfTextAtSize(next, size) > width && line) {
        lines.push(line)
        line = word
      } else line = next
    }
    lines.push(line)
  }
  return lines
}

async function bytesOf(attachmentId: string) {
  const url = await getAttachmentDataUrl(attachmentId)
  if (!url) return null
  const res = await fetch(url)
  return { bytes: new Uint8Array(await res.arrayBuffer()), type: res.headers.get('content-type') ?? (url.match(/^data:([^;]+)/)?.[1] ?? '') }
}

/** The whole case file as one PDF, in the country's order, ready to save,
 * print or attach to an email. */
export async function buildCaseFile(input: CaseFileInput): Promise<Uint8Array> {
  const pdf = await PDFDocument.create()
  pdf.setTitle(input.file.title)
  pdf.setCreator('Pleadli DPP')
  const serif = await pdf.embedFont(StandardFonts.TimesRoman)
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold)
  const sans = await pdf.embedFont(StandardFonts.Helvetica)
  const country = activeJurisdiction()
  const ref = input.file.odppRegistrationNumber ?? input.file.policeReference ?? ''

  // Documents in the order of the file.
  const sectionOrder = (kind: string) => {
    const s = sectionFor(country, kind)
    return s ? (country?.fileSections?.sections.indexOf(s) ?? 99) : 99
  }
  const items = [...input.items].sort((a, b) => sectionOrder(a.kind) - sectionOrder(b.kind) || a.position - b.position)

  // 1. The documents themselves, remembering where each one starts and ends.
  const ranges: { item: FileItem; from: number; to: number }[] = []
  const sources = new Map<string, { doc?: PDFDocument; image?: { bytes: Uint8Array; type: string } } | null>()
  for (const item of items) {
    const from = pdf.getPageCount() + 1
    if (item.attachmentId) {
      if (!sources.has(item.attachmentId)) {
        const got = await bytesOf(item.attachmentId).catch(() => null)
        if (!got) sources.set(item.attachmentId, null)
        else if (got.type.includes('pdf')) sources.set(item.attachmentId, { doc: await PDFDocument.load(got.bytes, { ignoreEncryption: true }) })
        else sources.set(item.attachmentId, { image: got })
      }
      const src = sources.get(item.attachmentId)
      if (src?.doc) {
        const total = src.doc.getPageCount()
        const first = Math.max(1, item.pageFrom ?? 1)
        const last = Math.min(total, item.pageTo ?? item.pageFrom ?? total)
        const copied = await pdf.copyPages(src.doc, Array.from({ length: last - first + 1 }, (_, i) => first - 1 + i))
        copied.forEach((p) => pdf.addPage(p))
      } else if (src?.image && /png|jpe?g/.test(src.image.type)) {
        const img = src.image.type.includes('png') ? await pdf.embedPng(src.image.bytes) : await pdf.embedJpg(src.image.bytes)
        const page = pdf.addPage(A4)
        const scale = Math.min((A4[0] - 2 * MARGIN) / img.width, (A4[1] - 2 * MARGIN) / img.height)
        page.drawImage(img, { x: (A4[0] - img.width * scale) / 2, y: (A4[1] - img.height * scale) / 2, width: img.width * scale, height: img.height * scale })
      } else {
        textPages(pdf, serif, bold, item.title, `${m["export.scan_missing"]()}\n\n${item.body ?? ''}`)
      }
    } else {
      const meta = [kindLabel(item.kind), item.documentDate ? formatDate(item.documentDate, 'long') : null].filter(Boolean).join(' · ')
      textPages(pdf, serif, bold, item.title, `${meta}\n\n${item.body ?? item.summary ?? ''}`)
    }
    ranges.push({ item, from, to: pdf.getPageCount() })
  }

  // 2. The index, then the cover, placed in front.
  const indexLines: { text: string; sheets: string; head?: boolean }[] = []
  let lastSection = ''
  for (const r of ranges) {
    const s = sectionFor(country, r.item.kind)
    const sectionName = s ? `${s.code}. ${packText(s.title)}` : kindLabel(r.item.kind)
    if (sectionName !== lastSection) {
      indexLines.push({ text: sectionName, sheets: '', head: true })
      lastSection = sectionName
    }
    indexLines.push({ text: r.item.title, sheets: r.from === r.to ? `${r.from}` : `${r.from}-${r.to}` })
  }
  const perPage = 34
  const indexPages = Math.max(1, Math.ceil(indexLines.length / perPage))
  // Sheet numbers count the documents only: cover and index come before sheet 1.
  for (let p = 0; p < indexPages; p++) {
    const page = pdf.insertPage(p, A4)
    let y = A4[1] - MARGIN
    if (p === 0) {
      page.drawText(safe(bold, m["export.index"]()), { x: MARGIN, y, size: 16, font: bold })
      y -= 28
      page.drawText(safe(sans, m["export.sheet_column"]()), { x: A4[0] - MARGIN - 60, y, size: 9, font: sans, color: rgb(0.4, 0.4, 0.4) })
      y -= 16
    }
    for (const line of indexLines.slice(p * perPage, (p + 1) * perPage)) {
      const font = line.head ? bold : sans
      const text = safe(font, line.text)
      const clipped = font.widthOfTextAtSize(text, 10.5) > A4[0] - 2 * MARGIN - 80 ? `${text.slice(0, 70)}...` : text
      page.drawText(clipped, { x: MARGIN + (line.head ? 0 : 14), y, size: 10.5, font })
      if (line.sheets) page.drawText(line.sheets, { x: A4[0] - MARGIN - 60, y, size: 10.5, font: sans })
      y -= line.head ? 20 : 17
    }
  }
  const cover = pdf.insertPage(0, A4)
  await drawCover(pdf, cover, input, bold, sans, serif, ranges.length, pdf.getPageCount() - 1 - indexPages)

  // 3. Footer on every document sheet.
  const docStart = 1 + indexPages
  pdf.getPages().forEach((page, i) => {
    if (i < docStart) return
    const sheet = i - docStart + 1
    const { width } = page.getSize()
    const label = safe(sans, `${ref}  ·  ${m["export.sheet"]({ n: sheet })}`)
    page.drawText(label, { x: width - MARGIN - sans.widthOfTextAtSize(label, 8), y: 20, size: 8, font: sans, color: rgb(0.35, 0.35, 0.35) })
    if (input.officeName) page.drawText(safe(sans, input.officeName), { x: MARGIN, y: 20, size: 8, font: sans, color: rgb(0.35, 0.35, 0.35) })
  })
  return pdf.save()
}

function textPages(pdf: PDFDocument, font: PDFFont, bold: PDFFont, title: string, body: string) {
  const width = A4[0] - 2 * MARGIN
  const lines = wrap(font, body, 11.5, width)
  let page: PDFPage = pdf.addPage(A4)
  let y = A4[1] - MARGIN
  for (const l of wrap(bold, title, 14, width)) {
    page.drawText(l, { x: MARGIN, y, size: 14, font: bold })
    y -= 20
  }
  y -= 8
  for (const line of lines) {
    if (y < MARGIN + 20) {
      page = pdf.addPage(A4)
      y = A4[1] - MARGIN
    }
    page.drawText(line, { x: MARGIN, y, size: 11.5, font })
    y -= 16
  }
}

async function drawCover(pdf: PDFDocument, page: PDFPage, input: CaseFileInput, bold: PDFFont, sans: PDFFont, serif: PDFFont, documents: number, sheets: number) {
  let y = A4[1] - 90
  if (input.logo && /^data:image\/(png|jpe?g)/.test(input.logo)) {
    try {
      const bytes = Uint8Array.from(atob(input.logo.split(',')[1]), (c) => c.charCodeAt(0))
      const img = input.logo.includes('png') ? await pdf.embedPng(bytes) : await pdf.embedJpg(bytes)
      const s = 70 / Math.max(img.width, img.height)
      page.drawImage(img, { x: (A4[0] - img.width * s) / 2, y: y - 40, width: img.width * s, height: img.height * s })
      y -= 70
    } catch {}
  }
  const centre = (text: string, size: number, font: PDFFont) => {
    for (const l of wrap(font, text, size, A4[0] - 2 * MARGIN)) {
      page.drawText(l, { x: (A4[0] - font.widthOfTextAtSize(l, size)) / 2, y, size, font })
      y -= size * 1.5
    }
  }
  const country = activeJurisdiction()
  centre(country?.institutions.dpp?.name ?? '', 12, sans)
  if (input.officeName) centre(input.officeName, 12, sans)
  y -= 30
  centre(m["export.case_file"]().toUpperCase(), 11, bold)
  y -= 6
  centre(input.file.title, 20, bold)
  y -= 30
  const rows: [string, string][] = [
    [referenceLabel('prosecution', m["file_ws.odpp_no"]), input.file.odppRegistrationNumber ?? '-'],
    [referenceLabel('police', m["file_ws.police_ref"]), input.file.policeReference ?? '-'],
    [referenceLabel('court', m["file_ws.court_no"]), input.file.courtCaseNumber ?? '-'],
    [m["file_ws.police_station"](), input.file.policeStation ?? '-'],
    [m["cover.accused"](), input.accused.join(', ') || '-'],
    [m["cover.offence"](), input.offences.join('; ') || '-'],
    [m["export.received"](), formatDate(input.file.receivedAt, 'long')],
    [m["export.contents"](), m["export.contents_value"]({ documents, sheets })],
    [m["export.prepared"](), formatDate(Date.now(), 'long')],
  ]
  for (const [k, v] of rows) {
    page.drawText(safe(sans, k), { x: MARGIN + 30, y, size: 10, font: sans, color: rgb(0.4, 0.4, 0.4) })
    const lines = wrap(serif, v, 12, A4[0] - 2 * MARGIN - 200)
    lines.forEach((l, i) => page.drawText(l, { x: MARGIN + 200, y: y - i * 15, size: 12, font: serif }))
    y -= 22 + (lines.length - 1) * 15
  }
}

const b64 = (bytes: Uint8Array) => {
  let s = ''
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(s)
}

const fileName = (title: string) => `${title.replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '').slice(0, 60) || 'case-file'}.pdf`

/** Saves the PDF where the prosecutor chooses. Returns false if they cancelled. */
export async function saveCaseFile(bytes: Uint8Array, title: string): Promise<boolean> {
  const name = fileName(title)
  if (isTauri()) {
    const path = await save({ defaultPath: name, filters: [{ name: 'PDF', extensions: ['pdf'] }] })
    if (!path) return false
    await invoke('save_case_pdf', { path, data: b64(bytes) })
    return true
  }
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'application/pdf' }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
  return true
}

/** Opens the PDF to print: the system viewer on the desktop, the print dialog in a browser. */
export async function printCaseFile(bytes: Uint8Array, title: string) {
  if (isTauri()) {
    await invoke('open_case_pdf', { name: fileName(title), data: b64(bytes) })
    return
  }
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'application/pdf' }))
  const frame = document.createElement('iframe')
  frame.style.position = 'fixed'
  frame.style.width = '0'
  frame.style.height = '0'
  frame.src = url
  document.body.appendChild(frame)
  frame.onload = () => frame.contentWindow?.print()
  setTimeout(() => {
    frame.remove()
    URL.revokeObjectURL(url)
  }, 120_000)
}

/** Opens the email program with a short covering message; the saved PDF is
 * attached by the prosecutor (email links cannot carry attachments). */
export async function emailCaseFile(to: string, subject: string, body: string) {
  const url = `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
  if (isTauri()) await openUrl(url)
  else window.location.href = url
}
