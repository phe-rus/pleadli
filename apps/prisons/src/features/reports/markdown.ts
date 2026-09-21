import { safeParseRichTextDoc } from '@pleadli/rich-text'

/**
 * Markdown as a second way to write and read a text block. The document the
 * editor keeps is the source of truth; this converts to and from it, and only
 * for what the editor can express: paragraphs, three heading levels, bold,
 * bullet and numbered lists. Anything else typed in Markdown is kept as plain
 * text rather than dropped, so switching between the two never loses words.
 */

type Node = { type?: string; text?: string; attrs?: { level?: number }; marks?: { type: string }[]; content?: Node[] }

function inline(nodes: Node[] = []): string {
  return nodes
    .map((node) => {
      if (node.type === 'hardBreak') return '  \n'
      const text = node.text ?? ''
      return node.marks?.some((mark) => mark.type === 'bold') && text.trim() ? `**${text}**` : text
    })
    .join('')
}

function block(node: Node): string {
  switch (node.type) {
    case 'heading':
      return `${'#'.repeat(Math.min(3, Math.max(1, node.attrs?.level ?? 1)))} ${inline(node.content)}`
    case 'bulletList':
      return (node.content ?? []).map((item) => `- ${(item.content ?? []).map(block).join(' ')}`).join('\n')
    case 'orderedList':
      return (node.content ?? []).map((item, index) => `${index + 1}. ${(item.content ?? []).map(block).join(' ')}`).join('\n')
    default:
      return inline(node.content)
  }
}

export function docToMarkdown(json: string | null | undefined): string {
  const doc = safeParseRichTextDoc(json)
  if (!doc) return ''
  return (doc.content ?? []).map((node) => block(node as Node)).join('\n\n').trim()
}

function marks(text: string): Node[] {
  const out: Node[] = []
  text.split(/(\*\*[^*]+\*\*)/).forEach((part) => {
    if (!part) return
    const bold = /^\*\*([^*]+)\*\*$/.exec(part)
    out.push(bold ? { type: 'text', text: bold[1], marks: [{ type: 'bold' }] } : { type: 'text', text: part })
  })
  return out
}

const paragraph = (text: string): Node => ({ type: 'paragraph', content: marks(text) })

export function markdownToDoc(markdown: string): string {
  const blocks: Node[] = []
  for (const chunk of markdown.replace(/\r\n/g, '\n').split(/\n{2,}/)) {
    const lines = chunk.split('\n').filter((line) => line.trim())
    if (lines.length === 0) continue
    const heading = /^(#{1,3})\s+(.*)$/.exec(lines[0])
    if (heading) {
      blocks.push({ type: 'heading', attrs: { level: heading[1].length }, content: marks(heading[2]) })
      if (lines.length > 1) blocks.push(paragraph(lines.slice(1).join(' ')))
    } else if (lines.every((line) => /^\s*[-*]\s+/.test(line))) {
      blocks.push({ type: 'bulletList', content: lines.map((line) => ({ type: 'listItem', content: [paragraph(line.replace(/^\s*[-*]\s+/, ''))] })) })
    } else if (lines.every((line) => /^\s*\d+\.\s+/.test(line))) {
      blocks.push({ type: 'orderedList', content: lines.map((line) => ({ type: 'listItem', content: [paragraph(line.replace(/^\s*\d+\.\s+/, ''))] })) })
    } else {
      blocks.push(paragraph(lines.map((line) => line.trim()).join(' ')))
    }
  }
  return JSON.stringify({ type: 'doc', content: blocks.length > 0 ? blocks : [{ type: 'paragraph' }] })
}
