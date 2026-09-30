import type { LawyerDocument } from '@/features/documents'
import { AlignmentType, Document, HeadingLevel, Packer, Paragraph, TextRun } from 'docx'

type Node = { type: string; text?: string; marks?: { type: string }[]; attrs?: { level?: number }; content?: Node[] }

function runs(n: Node): TextRun[] {
  if (n.type === 'text') {
    const marks = new Set((n.marks ?? []).map((m) => m.type))
    return [new TextRun({ text: n.text ?? '', bold: marks.has('bold'), italics: marks.has('italic'), underline: marks.has('underline') ? {} : undefined })]
  }
  if (n.type === 'hardBreak') return [new TextRun({ break: 1 })]
  return (n.content ?? []).flatMap(runs)
}

function blocks(n: Node, level = 0): Paragraph[] {
  switch (n.type) {
    case 'heading':
      return [new Paragraph({ children: runs(n), heading: n.attrs?.level === 3 ? HeadingLevel.HEADING_3 : HeadingLevel.HEADING_2, alignment: n.attrs?.level === 3 ? undefined : AlignmentType.CENTER })]
    case 'paragraph':
      return [new Paragraph({ children: runs(n), spacing: { after: 120 } })]
    case 'orderedList':
      return (n.content ?? []).flatMap((item, i) =>
        (item.content ?? []).flatMap((c, j) =>
          c.type === 'paragraph' && j === 0 ? [new Paragraph({ children: [new TextRun(`${i + 1}. `), ...runs(c)], indent: { left: 360 * (level + 1), hanging: 360 }, spacing: { after: 120 } })] : blocks(c, level + 1),
        ),
      )
    case 'bulletList':
      return (n.content ?? []).flatMap((item) => (item.content ?? []).flatMap((c) => (c.type === 'paragraph' ? [new Paragraph({ children: runs(c), bullet: { level } })] : blocks(c, level + 1))))
    default:
      return (n.content ?? []).flatMap((c) => blocks(c, level))
  }
}

function documentParagraphs(d: LawyerDocument, firm: string | null, newPage: boolean): Paragraph[] {
  const body = d.content?.body ?? d.body
  let root: Node | null = null
  try {
    root = JSON.parse(body) as Node
  } catch {
    root = null
  }
  const text: Paragraph[] = root?.type === 'doc' ? blocks(root) : body.split('\n').map((line) => new Paragraph({ children: [new TextRun(line)] }))
  const head: Paragraph[] = []
  const firmName = d.content?.firm ?? firm
  if (firmName) head.push(new Paragraph({ children: [new TextRun({ text: firmName.toUpperCase(), bold: true })], alignment: AlignmentType.CENTER, spacing: { after: 240 }, pageBreakBefore: newPage }))
  if (d.courtNumber) head.push(new Paragraph({ children: [new TextRun(d.courtNumber)], alignment: AlignmentType.CENTER, pageBreakBefore: newPage && !firmName }))
  head.push(new Paragraph({ children: [new TextRun({ text: d.matterTitle, bold: true })], alignment: AlignmentType.CENTER, spacing: { after: 240 }, pageBreakBefore: newPage && !firmName && !d.courtNumber }))
  const sign: Paragraph[] = d.content?.advocate
    ? [
        new Paragraph({ children: [new TextRun('')], spacing: { before: 480 } }),
        new Paragraph({ children: [new TextRun(`${d.content.advocate}, Advocate${d.content.practisingNumber ? `, P.C. ${d.content.practisingNumber}` : ''}`)], alignment: AlignmentType.RIGHT }),
        ...(d.reference ? [new Paragraph({ children: [new TextRun({ text: `${d.reference}${d.content.verifyCode ? `  ·  ${d.content.verifyCode}` : ''}`, size: 16 })] })] : []),
      ]
    : []
  return [...head, ...text, ...sign]
}

/** Documents as one Word file, each from a new page: a single document to keep
 * working on elsewhere, or everything filed together. */
export async function buildDocumentsDocx(documents: LawyerDocument[], firm: string | null, title: string): Promise<Uint8Array> {
  const doc = new Document({
    creator: 'Pleadli Lawyers',
    title,
    styles: { default: { document: { run: { font: 'Times New Roman', size: 24 } } } },
    sections: [{ children: documents.flatMap((d, i) => documentParagraphs(d, firm, i > 0)) }],
  })
  const blob = await Packer.toBlob(doc)
  return new Uint8Array(await blob.arrayBuffer())
}

export const buildDocumentDocx = (d: LawyerDocument, firm: string | null) => buildDocumentsDocx([d], firm, d.title)
