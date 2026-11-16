/** Portable reading model shared by all file formats. It contains document
 * text and structure, never executable markup or application controls. */
export type PaperNode = string | { tag: string; children: PaperNode[]; align?: 'center' | 'right'; bold?: boolean; span?: { colspan?: number; rowspan?: number }; start?: number }
export type Run = { text: string; bold?: boolean; italic?: boolean; underline?: boolean; strike?: boolean }
export type Paragraph = { kind: 'paragraph'; runs: Run[]; align?: 'center' | 'right'; heading?: number; list?: { ordered: boolean; index: number; depth: number }; quote?: boolean }
export type PaperBlock = Paragraph | { kind: 'table'; rows: { blocks: Paragraph[]; colspan: number; rowspan: number }[][] }
const omitted = new Set(['script', 'style', 'iframe', 'object', 'embed', 'button', 'input', 'textarea', 'select'])
const containers = new Set(['div', 'section', 'article', 'header', 'footer', 'main', 'tbody', 'thead', 'tfoot'])

export function readPaper(node: Node): PaperNode {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? ''
  if (!(node instanceof Element)) return ''
  const style = getComputedStyle(node)
  return {
    tag: node.tagName.toLowerCase(), children: Array.from(node.childNodes).map(readPaper),
    align: style.textAlign === 'center' ? 'center' : style.textAlign === 'right' || node.classList.contains('items-end') ? 'right' : undefined,
    bold: Number(style.fontWeight) >= 600,
    span: ['TD', 'TH'].includes(node.tagName) ? { colspan: Number(node.getAttribute('colspan') ?? 1), rowspan: Number(node.getAttribute('rowspan') ?? 1) } : undefined,
    start: node.tagName === 'OL' ? Number(node.getAttribute('start') ?? 1) : undefined,
  }
}

function inline(node: PaperNode, inherited: Omit<Run, 'text'> = {}): Run[] {
  if (typeof node === 'string') return [{ ...inherited, text: node }]
  if (omitted.has(node.tag)) return []
  if (node.tag === 'br') return [{ ...inherited, text: '\n' }]
  const style = { ...inherited, bold: inherited.bold || node.bold || ['strong', 'b', 'th'].includes(node.tag), italic: inherited.italic || ['em', 'i'].includes(node.tag), underline: inherited.underline || node.tag === 'u', strike: inherited.strike || node.tag === 's' }
  return node.children.flatMap(child => inline(child, style))
}

export function paperBlocks(paper: PaperNode): PaperBlock[] {
  function walk(node: PaperNode, align?: Paragraph['align'], depth = 0): PaperBlock[] {
    if (typeof node === 'string') return node.trim() ? [{ kind: 'paragraph', runs: [{ text: node }], align }] : []
    if (omitted.has(node.tag)) return []
    align = node.align ?? align
    if (node.tag === 'table') {
      const rows: Extract<PaperBlock, { kind: 'table' }>['rows'] = []
      function rowNodes(n: PaperNode) {
        if (typeof n === 'string') return
        if (n.tag === 'tr') rows.push(n.children.flatMap(cell => {
          if (typeof cell === 'string' || !['td', 'th'].includes(cell.tag)) return []
          const blocks = walk({ ...cell, tag: 'div', bold: cell.tag === 'th' || cell.bold, children: cell.children.map(c => cell.tag === 'th' && typeof c === 'object' ? { ...c, bold: true } : c) }, align, depth)
          if (blocks.some(b => b.kind === 'table')) throw new Error('This document has a nested table. Use Print to preserve its layout.')
          return [{ blocks: blocks.flatMap(b => b.kind === 'paragraph' ? [b] : []), colspan: cell.span?.colspan ?? 1, rowspan: cell.span?.rowspan ?? 1 }]
        }))
        else n.children.forEach(rowNodes)
      }
      rowNodes(node)
      return [{ kind: 'table', rows }]
    }
    if (node.tag === 'ol' || node.tag === 'ul') {
      let index = Number.isSafeInteger(node.start) ? node.start! : 1
      return node.children.flatMap(child => {
        if (typeof child === 'string' || child.tag !== 'li') return []
        const blocks = walk(child, align, depth + 1)
        const first = blocks.find(b => b.kind === 'paragraph')
        if (first?.kind === 'paragraph') first.list = { ordered: node.tag === 'ol', index: index++, depth }
        return blocks
      })
    }
    // Flush adjacent inline children together; block children retain boundaries.
    if (containers.has(node.tag) || node.tag === 'li' || node.tag === 'blockquote') {
      const result: PaperBlock[] = []
      let pending: PaperNode[] = []
      const flush = () => { if (pending.length) { const runs = pending.flatMap(c => inline(c, { bold: node.bold })); if (runs.some(r => r.text.trim())) result.push({ kind: 'paragraph', runs, align, quote: node.tag === 'blockquote' }); pending = [] } }
      for (const child of node.children) {
        if (typeof child !== 'string' && (containers.has(child.tag) || /^(p|h[1-6]|ol|ul|table|blockquote|pre)$/.test(child.tag))) { flush(); result.push(...walk(child, align, depth)) }
        else pending.push(child)
      }
      flush()
      return result
    }
    return [{ kind: 'paragraph', runs: inline(node), align, heading: /^h[1-6]$/.test(node.tag) ? Number(node.tag[1]) : undefined }]
  }
  return walk(paper)
}

const escapeMarkdown = (s: string) => s.replace(/([\\`*_[\]<>#|])/g, '\\$1')
export function documentMarkdown(blocks: PaperBlock[]): string {
  const paragraph = (p: Paragraph) => {
    const text = p.runs.map(r => { let value = escapeMarkdown(r.text); if (r.bold) value = `**${value}**`; if (r.italic) value = `*${value}*`; if (r.strike) value = `~~${value}~~`; return value }).join('')
    return `${p.heading ? '#'.repeat(p.heading) + ' ' : p.list ? '  '.repeat(p.list.depth) + (p.list.ordered ? `${p.list.index}. ` : '- ') : p.quote ? '> ' : ''}${text}`
  }
  return blocks.map(b => b.kind === 'paragraph' ? paragraph(b) : b.rows.map((row, i) => {
    if (row.some(c => c.colspan !== 1 || c.rowspan !== 1)) throw new Error('This table has merged cells. Use PDF, Word or Print to preserve its layout.')
    const line = '| ' + row.map(c => c.blocks.map(paragraph).join('<br>')).join(' | ') + ' |'
    return i === 0 ? line + '\n| ' + row.map(() => '---').join(' | ') + ' |' : line
  }).join('\n')).join('\n\n') + '\n'
}
