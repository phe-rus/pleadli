import { describe, expect, test } from 'bun:test'
import { PDFDocument } from 'pdf-lib'
import { createRequire } from 'node:module'
import { documentName } from '../src/features/documents/export'
import { documentMarkdown, paperBlocks, type PaperNode } from '../src/features/documents/paper'
import { documentPdf } from '../src/features/documents/pdf'
import { documentWord } from '../src/features/documents/word'

const fixture: PaperNode = { tag: 'section', children: [
  { tag: 'p', children: ['Draft · Not issued'] },
  { tag: 'h1', children: ['Order of adjournment'] },
  { tag: 'p', children: ['The matter is adjourned. ', { tag: 'strong', children: ['Wording remains intact.'] }] },
  { tag: 'ol', start: 3, children: [{ tag: 'li', children: ['Third direction'] }] },
  { tag: 'table', children: [{ tag: 'tr', children: [{ tag: 'td', children: ['Date'] }, { tag: 'td', children: ['12 October 2026'] }] }] },
  { tag: 'script', children: ['dangerous()'] },
  { tag: 'button', children: ['App control'] },
] }

describe('document preview exports', () => {
  test('shares text, draft status, numbering and tables without application controls', () => {
    const md = documentMarkdown(paperBlocks(fixture))
    expect(md).toContain('Draft · Not issued')
    expect(md).toContain('# Order of adjournment')
    expect(md).toContain('**Wording remains intact.**')
    expect(md).toContain('3. Third direction')
    expect(md).toContain('| Date | 12 October 2026 |')
    expect(md).not.toContain('dangerous')
    expect(md).not.toContain('App control')
  })
  test('produces a genuine loadable PDF and paginates long documents', async () => {
    const blocks = paperBlocks(fixture)
    for (let i = 0; i < 120; i++) blocks.push({ kind: 'paragraph', runs: [{ text: `Paragraph ${i}: ${'The original court wording is retained. '.repeat(6)}` }] })
    const bytes = await documentPdf('Draft - Order of adjournment', blocks)
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe('%PDF-')
    const loaded = await PDFDocument.load(bytes)
    expect(loaded.getPageCount()).toBeGreaterThan(2)
    expect(loaded.getTitle()).toBe('Draft - Order of adjournment')
    expect(loaded.getPage(0).getWidth()).toBeCloseTo(595.28)
  })
  test('does not silently substitute unsupported PDF characters', async () => {
    expect(documentPdf('Unicode', [{ kind: 'paragraph', runs: [{ text: '名字' }] }])).rejects.toThrow('preserve the full text')
  })
  test('creates an actual Word archive with editable document XML', async () => {
    const bytes = await documentWord('Draft order', paperBlocks(fixture))
    expect(Array.from(bytes.slice(0, 4))).toEqual([80, 75, 3, 4])
    // Inspect the Office package with the renderer's own ZIP dependency.
    const JSZip = createRequire(import.meta.resolve('docx'))('jszip')
    const zip = await JSZip.loadAsync(bytes)
    const xml = await zip.file('word/document.xml')!.async('string')
    expect(xml).toContain('Draft · Not issued')
    expect(xml).toContain('Order of adjournment')
    expect(xml).toContain('Wording remains intact.')
    expect(xml).toContain('<w:tbl>')
    expect(xml).not.toContain('dangerous')
    expect(await zip.file('word/numbering.xml')!.async('string')).toContain('w:val="3"')
  })
  test('uses the selected extension and bounds suggested file names', () => {
    expect(documentName('Draft - Order of adjournment', 'pdf')).toBe('Draft - Order of adjournment.pdf')
    expect(documentName('../../ORD/2026/0001', 'docx')).toBe('-..-ORD-2026-0001.docx')
    expect(documentName('', 'md')).toBe('Court document.md')
    expect(documentName('a'.repeat(200), 'pdf').length).toBe(104)
  })
})
