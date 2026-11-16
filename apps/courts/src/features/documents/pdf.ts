import { PDFDocument, StandardFonts, rgb, type PDFFont } from 'pdf-lib'
import type { PaperBlock, Paragraph, Run } from './paper'

/** Selectable text on A4 pages, with wrapping and continuation pages. */
export async function documentPdf(title: string, blocks: PaperBlock[]): Promise<Uint8Array> {
  const pdf = await PDFDocument.create()
  pdf.setTitle(title); pdf.setCreator('Pleadli Courts')
  const fonts = await Promise.all([StandardFonts.TimesRoman, StandardFonts.TimesRomanBold, StandardFonts.TimesRomanItalic, StandardFonts.TimesRomanBoldItalic].map(f => pdf.embedFont(f)))
  const fontFor = (r: Run, heading?: number): PDFFont => fonts[(r.bold || heading ? 1 : 0) + (r.italic ? 2 : 0)]!
  const width = 595.28, height = 841.89, margin = 48, usable = width - margin * 2
  let page = pdf.addPage([width, height]), y = height - margin
  type Piece = { run: Run; text: string; width: number; font: PDFFont }
  function lines(p: Paragraph, available: number, size: number): Piece[][] {
    const result: Piece[][] = [[]]
    let used = 0
    for (const run of p.runs) {
      const font = fontFor(run, p.heading)
      for (const token of run.text.split(/(\n|[^\S\n]+|[^\s]+)/).filter(Boolean)) {
        if (token === '\n') { result.push([]); used = 0; continue }
        let tokenWidth: number
        try { tokenWidth = font.widthOfTextAtSize(token, size) }
        catch { throw new Error('This PDF font cannot represent some characters. Choose Word, Markdown or Print to preserve the full text.') }
        if (used + tokenWidth > available && result[result.length - 1]!.length && token.trim()) { result.push([]); used = 0 }
        // Long identifiers must wrap as well as ordinary words.
        if (tokenWidth > available) {
          for (const char of token) {
            const w = font.widthOfTextAtSize(char, size)
            if (used + w > available) { result.push([]); used = 0 }
            result[result.length - 1]!.push({ run, text: char, width: w, font }); used += w
          }
        } else if (used || token.trim()) { result[result.length - 1]!.push({ run, text: token, width: tokenWidth, font }); used += tokenWidth }
      }
    }
    return result
  }
  function ensure(space: number) { if (y - space < margin) { page = pdf.addPage([width, height]); y = height - margin } }
  function draw(line: Piece[], x: number, baseline: number, size: number) {
    const grouped: Piece[] = []
    for (const piece of line) {
      const last = grouped[grouped.length - 1]
      if (last && last.run === piece.run && last.font === piece.font) { last.text += piece.text; last.width += piece.width }
      else grouped.push({ ...piece })
    }
    for (const piece of grouped) {
      page.drawText(piece.text, { x, y: baseline, size, font: piece.font })
      if (piece.run.underline || piece.run.strike) page.drawLine({ start: { x, y: baseline + (piece.run.strike ? size * .3 : -2) }, end: { x: x + piece.width, y: baseline + (piece.run.strike ? size * .3 : -2) }, thickness: .5 })
      x += piece.width
    }
  }
  function paragraph(p: Paragraph) {
    const size = p.heading ? Math.max(12, 18 - p.heading) : 11
    const indent = p.list ? 16 * (p.list.depth + 1) : p.quote ? 16 : 0
    const content = lines(p, usable - indent, size), step = size * 1.5
    ensure(step * Math.min(content.length + (p.heading ? 2 : 0), 3))
    for (const [i, line] of content.entries()) {
      ensure(step); y -= step
      const measured = line.reduce((sum, part) => sum + part.width, 0)
      const x = p.align === 'center' ? margin + (usable - measured) / 2 : p.align === 'right' ? width - margin - measured : margin + indent
      if (i === 0 && p.list) page.drawText(p.list.ordered ? `${p.list.index}.` : '•', { x: margin + indent - 14, y, size, font: fonts[0] })
      draw(line, x, y, size)
    }
    y -= p.heading ? 10 : 7
  }
  for (const block of blocks) {
    if (block.kind === 'paragraph') { paragraph(block); continue }
    const columns = Math.max(1, ...block.rows.map(row => row.reduce((sum, cell) => sum + cell.colspan, 0)))
    for (const row of block.rows) {
      if (row.some(c => c.rowspan !== 1)) throw new Error('This table has vertically merged cells. Use Print to preserve its layout.')
      const cells = row.map(cell => ({ width: usable * cell.colspan / columns, lines: cell.blocks.flatMap(p => lines(p, usable * cell.colspan / columns - 12, 10)) }))
      const count = Math.max(1, ...cells.map(c => c.lines.length))
      let offset = 0
      while (offset < count) {
        ensure(32)
        const fitting = Math.max(1, Math.min(count - offset, Math.floor((y - margin - 12) / 15)))
        const rowHeight = fitting * 15 + 12
        let x = margin
        for (const cell of cells) {
          page.drawRectangle({ x, y: y - rowHeight, width: cell.width, height: rowHeight, borderColor: rgb(.65, .65, .65), borderWidth: .5 })
          cell.lines.slice(offset, offset + fitting).forEach((line, i) => draw(line, x + 6, y - 17 - i * 15, 10))
          x += cell.width
        }
        y -= rowHeight; offset += fitting
        if (offset < count) { page = pdf.addPage([width, height]); y = height - margin }
      }
    }
    y -= 10
  }
  const pages = pdf.getPages()
  pages.forEach((p, i) => p.drawText(`${i + 1} / ${pages.length}`, { x: width - margin - 35, y: 25, size: 9, font: fonts[0], color: rgb(.4, .4, .4) }))
  return pdf.save()
}
