import type { DocumentContent, LawyerDocument } from '@/features/documents'
import { richTextToPlainText } from '@pleadli/rich-text'
import { invoke, isTauri } from '@tauri-apps/api/core'
import { PDFDocument, rgb, StandardFonts, type PDFFont, type PDFImage, type PDFPage } from 'pdf-lib'

/** The filing pack: one PDF of everything filed together, in order, with a
 * cover and an index with page numbers, ready to upload to ECCMIS, print, or
 * send (docs/lawyers/REVIEW-2026-09-30.md, 4.3; D8). Built here from the
 * sealed content of each document, so the pack is exactly what was filed. */

const A4: [number, number] = [595.28, 841.89]
const MARGIN = 64
const WIDTH = A4[0] - 2 * MARGIN

export type PackInput = {
  firm: string | null
  address: string | null
  court: string | null
  courtReference: string | null
  matterTitle: string
  filedOn: string
  filedBy: string
  fee: string | null
  documents: LawyerDocument[]
  labels: { cover: string; index: string; document: string; reference: string; page: string; filedOn: string; filedBy: string; fee: string; verify: string }
}

type Node = { type: string; text?: string; marks?: { type: string }[]; attrs?: { level?: number }; content?: Node[] }

function safe(font: PDFFont, text: string) {
  let out = ''
  for (const ch of text.replace(/\t/g, '    ')) {
    try {
      font.encodeText(ch)
      out += ch
    } catch {
      out += ch === '’' || ch === '‘' ? "'" : ch === '“' || ch === '”' ? '"' : '?'
    }
  }
  return out
}

function wrap(font: PDFFont, text: string, size: number, width: number) {
  const lines: string[] = []
  let line = ''
  for (const word of safe(font, text).split(/\s+/).filter(Boolean)) {
    const next = line ? `${line} ${word}` : word
    if (font.widthOfTextAtSize(next, size) > width && line) {
      lines.push(line)
      line = word
    } else line = next
  }
  lines.push(line)
  return lines
}

/** A page cursor: writes lines and starts a new page when one is full. */
class Writer {
  page: PDFPage
  y: number
  constructor(private pdf: PDFDocument) {
    this.page = pdf.addPage(A4)
    this.y = A4[1] - MARGIN
  }
  ensure(height: number) {
    if (this.y - height < MARGIN + 40) {
      this.page = this.pdf.addPage(A4)
      this.y = A4[1] - MARGIN
    }
  }
  line(text: string, font: PDFFont, size: number, { indent = 0, center = false } = {}) {
    for (const l of wrap(font, text, size, WIDTH - indent)) {
      this.ensure(size + 4)
      const w = font.widthOfTextAtSize(l, size)
      this.page.drawText(l, { x: center ? (A4[0] - w) / 2 : MARGIN + indent, y: this.y - size, size, font, color: rgb(0.1, 0.1, 0.1) })
      this.y -= size + 4
    }
  }
  gap(h = 6) {
    this.y -= h
  }
}

const plain = (n: Node): string => (n.text ?? '') + (n.content ?? []).map(plain).join('')
const isBold = (n: Node) => (n.content ?? []).length > 0 && (n.content ?? []).every((c) => c.marks?.some((mk) => mk.type === 'bold'))

function renderBody(w: Writer, body: string, fonts: { serif: PDFFont; bold: PDFFont }) {
  let root: Node | null = null
  try {
    root = JSON.parse(body) as Node
  } catch {
    root = null
  }
  if (!root || root.type !== 'doc') {
    for (const para of body.split('\n')) w.line(para, fonts.serif, 11)
    return
  }
  const block = (n: Node, indent: number, number?: number) => {
    switch (n.type) {
      case 'heading':
        w.gap(4)
        w.line(plain(n).toUpperCase(), fonts.bold, n.attrs?.level === 3 ? 11 : 12, { center: n.attrs?.level !== 3, indent })
        w.gap(2)
        break
      case 'paragraph': {
        const text = plain(n)
        if (!text) {
          w.gap(8)
          break
        }
        w.line(number != null ? `${number}. ${text}` : text, isBold(n) ? fonts.bold : fonts.serif, 11, { indent })
        w.gap(3)
        break
      }
      case 'orderedList':
        ;(n.content ?? []).forEach((item, i) => (item.content ?? []).forEach((c, j) => block(c, indent + 14, j === 0 ? i + 1 : undefined)))
        break
      case 'bulletList':
        ;(n.content ?? []).forEach((item) => (item.content ?? []).forEach((c) => block({ ...c, content: [{ type: 'text', text: `• ${plain(c)}` }] }, indent + 14)))
        break
      default:
        ;(n.content ?? []).forEach((c) => block(c, indent))
    }
  }
  ;(root.content ?? []).forEach((n) => block(n, 0))
}

/** One copy of each image per pack: the same signature and stamp sit on every document. */
const embedded = new WeakMap<PDFDocument, Map<string, Promise<PDFImage | null>>>()

function embedImage(pdf: PDFDocument, dataUrl: string | null | undefined): Promise<PDFImage | null> {
  if (!dataUrl) return Promise.resolve(null)
  const cache = embedded.get(pdf) ?? new Map<string, Promise<PDFImage | null>>()
  embedded.set(pdf, cache)
  const found = cache.get(dataUrl)
  if (found) return found
  const image = embedNew(pdf, dataUrl)
  cache.set(dataUrl, image)
  return image
}

async function embedNew(pdf: PDFDocument, dataUrl: string): Promise<PDFImage | null> {
  const bytes = Uint8Array.from(atob(dataUrl.split(',')[1] ?? ''), (c) => c.charCodeAt(0))
  if (dataUrl.startsWith('data:image/png')) return pdf.embedPng(bytes)
  if (dataUrl.startsWith('data:image/jpeg')) return pdf.embedJpg(bytes)
  return null // WebP: not embeddable, the typed name still stands.
}

/** The QR is an SVG the backend drew; a PDF takes it as a PNG. */
async function qrPng(svg: string | null | undefined): Promise<string | null> {
  if (!svg || typeof document === 'undefined') return null
  const img = new Image()
  img.src = `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
  await img.decode()
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 192
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, 192, 192)
  ctx.drawImage(img, 0, 0, 192, 192)
  return canvas.toDataURL('image/png')
}

type Fonts = { serif: PDFFont; bold: PDFFont; sans: PDFFont }

/** One document from its first page: letterhead, caption, body, and (once
 * filed) the signature, stamp, reference, verification code and QR. */
async function drawDocument(pdf: PDFDocument, d: Pick<LawyerDocument, 'reference'>, c: DocumentContent, { serif, bold, sans }: Fonts, verifyLabel: string, draft = false) {
  const first = pdf.getPageCount()
  const w = new Writer(pdf)
  if (draft) w.line('DRAFT', sans, 9, { center: true })
  if (c.firm) w.line(c.firm.toUpperCase(), bold, 12, { center: true })
  const contacts = [c.firmAddress, c.firmPhone, c.firmEmail].filter(Boolean).join(' · ')
  if (contacts) w.line(contacts, sans, 8, { center: true })
  w.gap(14)
  if (!richTextToPlainText(c.body).toUpperCase().includes(c.heading)) {
    if (c.courtNumber) w.line(c.courtNumber, serif, 11, { center: true })
    w.line(c.matterTitle, bold, 11, { center: true })
    w.gap(6)
    w.line(c.heading, bold, 12, { center: true })
    w.gap(8)
  }
  renderBody(w, c.body, { serif, bold })

  if (draft) return
  // Signature and stamp.
  w.ensure(120)
  const sig = await embedImage(pdf, c.signatureImage)
  const stamp = await embedImage(pdf, c.stampImage)
  w.gap(20)
  if (stamp) w.page.drawImage(stamp, { x: MARGIN, y: w.y - 80, width: 80, height: 80, opacity: 0.9 })
  if (sig) w.page.drawImage(sig, { x: A4[0] - MARGIN - 180, y: w.y - 44, width: 120, height: 40 })
  w.y -= 50
  w.page.drawLine({ start: { x: A4[0] - MARGIN - 190, y: w.y }, end: { x: A4[0] - MARGIN, y: w.y }, thickness: 0.6, color: rgb(0.3, 0.3, 0.3) })
  w.y -= 4
  w.page.drawText(safe(serif, `${c.advocate}, Advocate${c.practisingNumber ? `, P.C. ${c.practisingNumber}` : ''}`), { x: A4[0] - MARGIN - 190, y: w.y - 10, size: 10, font: serif })
  w.y -= 40
  if (c.drawnBy) w.line(`Drawn and filed by: ${c.drawnBy}`, sans, 8)

  // Every page of the document carries its reference and code; the last, the QR.
  const qr = await embedImage(pdf, await qrPng(c.verifyQr))
  const pages = pdf.getPages().slice(first)
  pages.forEach((page, i) => {
    page.drawText(safe(sans, `${d.reference ?? ''}${c.verifyCode ? `  ·  ${verifyLabel} ${c.verifyCode}` : ''}`), { x: MARGIN, y: 30, size: 7, font: sans, color: rgb(0.35, 0.35, 0.35) })
    if (qr && i === pages.length - 1) page.drawImage(qr, { x: A4[0] - MARGIN - 48, y: 22, width: 48, height: 48 })
  })
}

export async function buildFilingPack(input: PackInput): Promise<Uint8Array> {
  const pdf = await PDFDocument.create()
  pdf.setTitle(`${input.matterTitle}, ${input.filedOn}`)
  pdf.setCreator('Pleadli Lawyers')
  const serif = await pdf.embedFont(StandardFonts.TimesRoman)
  const bold = await pdf.embedFont(StandardFonts.TimesRomanBold)
  const sans = await pdf.embedFont(StandardFonts.Helvetica)
  const starts: number[] = []

  for (const d of input.documents) {
    if (!d.content) continue
    starts.push(pdf.getPageCount())
    await drawDocument(pdf, d, d.content, { serif, bold, sans }, input.labels.verify)
  }

  // The cover goes first, now that each document's first page is known.
  const cover = pdf.insertPage(0, A4)
  let y = A4[1] - MARGIN
  const put = (text: string, font: PDFFont, size: number, x = MARGIN) => {
    for (const l of wrap(font, text, size, WIDTH)) {
      cover.drawText(l, { x, y: y - size, size, font })
      y -= size + 5
    }
  }
  if (input.firm) put(input.firm.toUpperCase(), bold, 13)
  if (input.address) put(input.address, sans, 9)
  y -= 20
  put(input.labels.cover, bold, 16)
  y -= 6
  put(input.matterTitle, bold, 12)
  if (input.court) put(input.court, serif, 11)
  if (input.courtReference) put(input.courtReference, serif, 11)
  put(`${input.labels.filedOn} ${input.filedOn} · ${input.labels.filedBy} ${input.filedBy}`, sans, 9)
  if (input.fee) put(`${input.labels.fee} ${input.fee}`, sans, 9)
  y -= 24
  put(input.labels.index, bold, 12)
  y -= 4
  input.documents.forEach((d, i) => {
    const page = String((starts[i] ?? 0) + 2)
    const row = `${i + 1}.  ${d.content?.heading ?? d.title}${d.reference ? `  (${d.reference})` : ''}`
    cover.drawText(safe(serif, row).slice(0, 90), { x: MARGIN, y: y - 11, size: 11, font: serif })
    cover.drawText(page, { x: A4[0] - MARGIN - serif.widthOfTextAtSize(page, 11), y: y - 11, size: 11, font: serif })
    y -= 18
  })
  // Page numbers on every page, cover included.
  const total = pdf.getPageCount()
  pdf.getPages().forEach((page, i) => page.drawText(`${i + 1} / ${total}`, { x: A4[0] / 2 - 10, y: 16, size: 7, font: sans, color: rgb(0.4, 0.4, 0.4) }))
  return pdf.save()
}

/** Saves the pack where the person chooses (desktop), or downloads it (browser). */
export async function savePack(bytes: Uint8Array, name: string): Promise<boolean> {
  const file = name.replace(/[^\w.-]+/g, '-')
  if (isTauri()) {
    const { save } = await import('@tauri-apps/plugin-dialog')
    const path = await save({ defaultPath: file, filters: [{ name: 'PDF', extensions: ['pdf'] }] })
    if (!path) return false
    let binary = ''
    for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
    await invoke('save_pdf', { path, data: btoa(binary) })
    return true
  }
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'application/pdf' }))
  const link = document.createElement('a')
  link.href = url
  link.download = file
  link.click()
  URL.revokeObjectURL(url)
  return true
}

/** One document on its own: as filed (sealed content, signature, code), or a
 * draft marked DRAFT, from its current text. */
export async function buildDocumentPdf(d: LawyerDocument, firm: { name: string | null; address: string | null; phone: string | null; email: string | null }, verifyLabel: string): Promise<Uint8Array> {
  const pdf = await PDFDocument.create()
  pdf.setTitle(d.reference ? `${d.title} (${d.reference})` : d.title)
  pdf.setCreator('Pleadli Lawyers')
  const fonts = { serif: await pdf.embedFont(StandardFonts.TimesRoman), bold: await pdf.embedFont(StandardFonts.TimesRomanBold), sans: await pdf.embedFont(StandardFonts.Helvetica) }
  const draft = !d.content
  const content: DocumentContent = d.content ?? {
    heading: d.title.toUpperCase(),
    body: d.body,
    matterTitle: d.matterTitle,
    courtNumber: d.courtNumber,
    advocate: '',
    firm: firm.name,
    firmAddress: firm.address,
    firmPhone: firm.phone,
    firmEmail: firm.email,
  } as DocumentContent
  await drawDocument(pdf, d, content, fonts, verifyLabel, draft)
  const total = pdf.getPageCount()
  pdf.getPages().forEach((page, i) => page.drawText(`${i + 1} / ${total}`, { x: A4[0] / 2 - 10, y: 16, size: 7, font: fonts.sans, color: rgb(0.4, 0.4, 0.4) }))
  return pdf.save()
}
