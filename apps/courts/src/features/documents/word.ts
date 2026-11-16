import { AlignmentType, Document, Footer, HeadingLevel, LevelFormat, Packer, PageNumber, Paragraph, Table, TableCell, TableRow, TextRun, WidthType } from 'docx'
import type { PaperBlock, Paragraph as PaperParagraph } from './paper'

export async function documentWord(title: string, blocks: PaperBlock[]): Promise<Uint8Array> {
  const numbering: { reference: string; levels: { level: number; format: typeof LevelFormat.DECIMAL | typeof LevelFormat.BULLET; text: string; start: number; style: { paragraph: { indent: { left: number; hanging: number } } } }[] }[] = []
  let serial = 0
  const paragraph = (p: PaperParagraph) => {
    let reference: string | undefined
    if (p.list) {
      reference = `list-${serial++}`
      numbering.push({ reference, levels: [{ level: 0, format: p.list.ordered ? LevelFormat.DECIMAL : LevelFormat.BULLET, text: p.list.ordered ? '%1.' : '•', start: p.list.index, style: { paragraph: { indent: { left: 360 * (p.list.depth + 1), hanging: 240 } } } }] })
    }
    return new Paragraph({
      children: p.runs.flatMap(r => r.text.split('\n').map((text, index) => new TextRun({ text, break: index ? 1 : undefined, bold: r.bold, italics: r.italic, underline: r.underline ? {} : undefined, strike: r.strike }))),
      heading: p.heading ? [HeadingLevel.HEADING_1, HeadingLevel.HEADING_2, HeadingLevel.HEADING_3, HeadingLevel.HEADING_4, HeadingLevel.HEADING_5, HeadingLevel.HEADING_6][p.heading - 1] : undefined,
      alignment: p.align === 'center' ? AlignmentType.CENTER : p.align === 'right' ? AlignmentType.RIGHT : AlignmentType.LEFT,
      numbering: reference ? { reference, level: 0 } : undefined,
      indent: p.quote ? { left: 360 } : undefined,
      spacing: { after: 140, line: 320 }, keepNext: !!p.heading,
    })
  }
  const children = blocks.map(b => {
    if (b.kind === 'paragraph') return paragraph(b)
    const columns = Math.max(1, ...b.rows.map(row => row.reduce((sum, c) => sum + c.colspan, 0)))
    const widths = Array.from({ length: columns }, (_, i) => Math.floor(10000 / columns) + (i === 0 ? 10000 % columns : 0))
    return new Table({ columnWidths: widths, width: { size: 10000, type: WidthType.DXA }, rows: b.rows.map(row => {
      let column = 0
      return new TableRow({ children: row.map(c => {
        if (c.rowspan !== 1) throw new Error('This table has vertically merged cells. Use Print to preserve its layout.')
        const size = widths.slice(column, column + c.colspan).reduce((sum, w) => sum + w, 0); column += c.colspan
        return new TableCell({ width: { size, type: WidthType.DXA }, columnSpan: c.colspan, children: c.blocks.length ? c.blocks.map(paragraph) : [new Paragraph('')] })
      }) })
    }) })
  })
  const document = new Document({ title, creator: 'Pleadli Courts', styles: { default: { document: { run: { font: 'Times New Roman', size: 22 } } }, paragraphStyles: Array.from({ length: 6 }, (_, i) => ({ id: `Heading${i + 1}`, name: `Heading ${i + 1}`, basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { font: 'Times New Roman', color: '000000', bold: true, size: Math.max(24, 36 - (i + 1) * 2) } })) }, numbering: { config: numbering }, sections: [{ properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 960, right: 960, bottom: 960, left: 960 } } }, footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ children: [PageNumber.CURRENT, ' / ', PageNumber.TOTAL_PAGES] })] })] }) }, children }] })
  return new Uint8Array(await Packer.toArrayBuffer(document))
}
