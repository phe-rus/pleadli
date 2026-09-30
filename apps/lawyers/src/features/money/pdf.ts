import { PDFDocument, rgb, StandardFonts, type PDFFont } from 'pdf-lib'
import type { FeeNote } from './data'

const A4: [number, number] = [595.28, 841.89]
const MARGIN = 64

export type FeeNoteLabels = {
  heading: string
  to: string
  matter: string
  number: string
  issued: string
  due: string
  description: string
  amount: string
  total: string
  paid: string
  outstanding: string
  notTax: string
  minutes: (n: number) => string
}

/** Standard PDF fonts carry WinAnsi only: anything else becomes '?'. */
function safe(font: PDFFont, text: string) {
  let out = ''
  // French and other locales group digits with a narrow no-break space.
  for (const ch of text.replace(/[\u202f\u2009]/g, ' ')) {
    try {
      font.encodeText(ch)
      out += ch
    } catch {
      out += '?'
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

/** A fee note on the practice's letterhead, to print or send the client.
 * Money is written as the screen writes it (`money`), so both agree. */
export async function feeNotePdf(note: FeeNote, practice: { name: string; address: string | null; phone: string | null; email: string | null }, labels: FeeNoteLabels, money: (n: number) => string, day: (ms: number) => string): Promise<Uint8Array> {
  const pdf = await PDFDocument.create()
  pdf.setTitle(`${note.number ?? labels.heading}, ${note.clientName}`)
  pdf.setCreator('Pleadli Lawyers')
  const serif = await pdf.embedFont(StandardFonts.TimesRoman)
  const bold = await pdf.embedFont(StandardFonts.TimesRomanBold)
  const sans = await pdf.embedFont(StandardFonts.Helvetica)
  const page = pdf.addPage(A4)
  const ink = rgb(0.1, 0.1, 0.1)
  let y = A4[1] - MARGIN
  const centre = (text: string, font: PDFFont, size: number) => {
    const t = safe(font, text)
    page.drawText(t, { x: (A4[0] - font.widthOfTextAtSize(t, size)) / 2, y: y - size, size, font, color: ink })
    y -= size + 4
  }
  const right = (text: string, font: PDFFont, size: number, atY: number) => {
    const t = safe(font, text)
    page.drawText(t, { x: A4[0] - MARGIN - font.widthOfTextAtSize(t, size), y: atY, size, font, color: ink })
  }

  centre(practice.name.toUpperCase(), bold, 14)
  const contacts = [practice.address, practice.phone, practice.email].filter(Boolean).join(' · ')
  if (contacts) centre(contacts, sans, 8)
  y -= 18
  centre(labels.heading.toUpperCase(), bold, 13)
  y -= 10

  const pair = (label: string, value: string) => {
    page.drawText(safe(sans, label), { x: MARGIN, y: y - 10, size: 9, font: sans, color: rgb(0.35, 0.35, 0.35) })
    page.drawText(safe(serif, value), { x: MARGIN + 110, y: y - 10, size: 11, font: serif, color: ink })
    y -= 16
  }
  pair(labels.number, note.number ?? '')
  pair(labels.to, note.clientName)
  pair(labels.matter, note.courtNumber ? `${note.courtNumber}, ${note.matterTitle}` : note.matterTitle)
  if (note.issuedOn) pair(labels.issued, day(note.issuedOn))
  if (note.dueOn) pair(labels.due, day(note.dueOn))
  y -= 14

  page.drawText(safe(bold, labels.description), { x: MARGIN, y: y - 11, size: 11, font: bold, color: ink })
  right(labels.amount, bold, 11, y - 11)
  y -= 16
  page.drawLine({ start: { x: MARGIN, y }, end: { x: A4[0] - MARGIN, y }, thickness: 0.6, color: rgb(0.5, 0.5, 0.5) })
  y -= 6
  for (const line of note.lines) {
    const text = line.kind === 'time' && line.minutes ? `${line.description} (${labels.minutes(line.minutes)})` : line.description
    const rows = wrap(serif, text, 11, A4[0] - 2 * MARGIN - 120)
    rows.forEach((r, i) => {
      page.drawText(r, { x: MARGIN, y: y - 11, size: 11, font: serif, color: ink })
      if (i === 0) right(money(line.amount), serif, 11, y - 11)
      y -= 15
    })
    y -= 3
  }
  page.drawLine({ start: { x: MARGIN, y }, end: { x: A4[0] - MARGIN, y }, thickness: 0.6, color: rgb(0.5, 0.5, 0.5) })
  y -= 8
  const total = (label: string, value: number, font: PDFFont) => {
    page.drawText(safe(font, label), { x: A4[0] - MARGIN - 260, y: y - 11, size: 11, font, color: ink })
    right(money(value), font, 11, y - 11)
    y -= 16
  }
  total(labels.total, note.total, bold)
  if (note.paid > 0) {
    total(labels.paid, note.paid, serif)
    total(labels.outstanding, note.total - note.paid, bold)
  }
  if (note.note) {
    y -= 12
    for (const r of wrap(serif, note.note, 10, A4[0] - 2 * MARGIN)) {
      page.drawText(r, { x: MARGIN, y: y - 10, size: 10, font: serif, color: ink })
      y -= 13
    }
  }
  page.drawText(safe(sans, labels.notTax), { x: MARGIN, y: 30, size: 7, font: sans, color: rgb(0.4, 0.4, 0.4) })
  return pdf.save()
}

export type BillLabels = {
  heading: string
  no: string
  date: string
  item: string
  particulars: string
  claimed: string
  agreed: string
  taxed: string
  total: string
  drawnBy: string
  source: string
}

/** The bill of costs as lodged for taxation: the case caption, one numbered
 * row per item with the Schedule item it is claimed under, and what was
 * claimed, agreed at the pre-taxation meeting (reg. 13A) and taxed. */
export async function billPdf(
  bill: import('./bills').Bill,
  caption: { court: string; number: string; title: string },
  practice: { name: string; address: string | null },
  labels: BillLabels,
  money: (n: number) => string,
  day: (ms: number) => string,
): Promise<Uint8Array> {
  const size: [number, number] = [841.89, 595.28]
  const pdf = await PDFDocument.create()
  pdf.setTitle(`${labels.heading}, ${caption.number || caption.title}`)
  pdf.setCreator('Pleadli Lawyers')
  const serif = await pdf.embedFont(StandardFonts.TimesRoman)
  const bold = await pdf.embedFont(StandardFonts.TimesRomanBold)
  const sans = await pdf.embedFont(StandardFonts.Helvetica)
  const ink = rgb(0.1, 0.1, 0.1)
  const M = 48
  const cols = { no: M, date: M + 30, item: M + 110, part: M + 170, claimed: size[0] - M - 260, agreed: size[0] - M - 170, taxed: size[0] - M - 80 }
  let page = pdf.addPage(size)
  let y = size[1] - M
  const text = (t: string, x: number, font: PDFFont, s: number) => page.drawText(safe(font, t), { x, y: y - s, size: s, font, color: ink })
  const rightAt = (t: string, x: number, font: PDFFont, s: number) => {
    const v = safe(font, t)
    page.drawText(v, { x: x + 78 - font.widthOfTextAtSize(v, s), y: y - s, size: s, font, color: ink })
  }
  const centre = (t: string, font: PDFFont, s: number) => {
    const v = safe(font, t)
    page.drawText(v, { x: (size[0] - font.widthOfTextAtSize(v, s)) / 2, y: y - s, size: s, font, color: ink })
    y -= s + 4
  }
  centre('THE REPUBLIC OF UGANDA', bold, 11)
  centre(`IN THE ${(caption.court || '____ COURT').toUpperCase()}`, bold, 11)
  if (caption.number) centre(caption.number.toUpperCase(), bold, 11)
  centre(caption.title.toUpperCase().replace(/ V\. /g, ' v. '), serif, 11)
  y -= 8
  centre(labels.heading.toUpperCase(), bold, 13)
  y -= 8
  const header = () => {
    text(labels.no, cols.no, bold, 9)
    text(labels.date, cols.date, bold, 9)
    text(labels.item, cols.item, bold, 9)
    text(labels.particulars, cols.part, bold, 9)
    rightAt(labels.claimed, cols.claimed, bold, 9)
    rightAt(labels.agreed, cols.agreed, bold, 9)
    rightAt(labels.taxed, cols.taxed, bold, 9)
    y -= 14
    page.drawLine({ start: { x: M, y }, end: { x: size[0] - M, y }, thickness: 0.6, color: rgb(0.5, 0.5, 0.5) })
    y -= 4
  }
  header()
  bill.items.forEach((it, i) => {
    const rows = wrap(serif, it.particulars, 10, cols.claimed - cols.part - 12)
    if (y - rows.length * 13 < M + 60) {
      page = pdf.addPage(size)
      y = size[1] - M
      header()
    }
    text(String(i + 1), cols.no, serif, 10)
    if (it.onDay) text(day(it.onDay), cols.date, serif, 10)
    if (it.itemRef) text(it.itemRef, cols.item, serif, 10)
    rightAt(money(it.claimed), cols.claimed, serif, 10)
    if (it.agreed != null) rightAt(money(it.agreed), cols.agreed, serif, 10)
    if (it.taxed != null) rightAt(money(it.taxed), cols.taxed, serif, 10)
    rows.forEach((r) => {
      text(r, cols.part, serif, 10)
      y -= 13
    })
    y -= 3
  })
  page.drawLine({ start: { x: M, y }, end: { x: size[0] - M, y }, thickness: 0.6, color: rgb(0.5, 0.5, 0.5) })
  y -= 4
  const sum = (pick: (i: import('./bills').BillItem) => number | null) => bill.items.reduce((s, i) => s + (pick(i) ?? 0), 0)
  text(labels.total, cols.part, bold, 10)
  rightAt(money(sum((i) => i.claimed)), cols.claimed, bold, 10)
  if (bill.items.some((i) => i.agreed != null)) rightAt(money(sum((i) => i.agreed)), cols.agreed, bold, 10)
  if (bill.items.some((i) => i.taxed != null)) rightAt(money(sum((i) => i.taxed)), cols.taxed, bold, 10)
  y -= 30
  text(`${labels.drawnBy}: ${practice.name}${practice.address ? `, ${practice.address}` : ''}`, M, sans, 8)
  page.drawText(safe(sans, labels.source), { x: M, y: 24, size: 7, font: sans, color: rgb(0.4, 0.4, 0.4) })
  return pdf.save()
}
