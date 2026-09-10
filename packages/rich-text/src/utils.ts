type ProseMirrorNode = {
  type?: string
  text?: string
  content?: ProseMirrorNode[]
}

/**
 * Flattens a serialized editor-document JSON string into plain text (block
 * boundaries become spaces). For previews/search, not for re-editing.
 */
export function richTextToPlainText(json: string | null | undefined): string {
  if (!json) return ''

  try {
    const doc = JSON.parse(json) as ProseMirrorNode
    const parts: string[] = []
    const walk = (node: ProseMirrorNode | undefined) => {
      if (!node) return
      if (typeof node.text === 'string') parts.push(node.text)
      node.content?.forEach(walk)
    }
    walk(doc)
    return parts.join(' ').replace(/\s+/g, ' ').trim()
  } catch {
    return ''
  }
}

/**
 * Whether a serialized editor-document JSON string represents genuinely
 * empty content (no content at all, or a single empty paragraph — Tiptap's
 * default state for a fresh editor).
 */
export function isRichTextEmpty(json: string | null | undefined): boolean {
  if (!json) return true

  try {
    const content = JSON.parse(json)?.content
    if (!Array.isArray(content) || content.length === 0) return true
    if (content.length === 1) {
      const only = content[0]
      return only?.type === 'paragraph' && (!only.content || only.content.length === 0)
    }
    return false
  } catch {
    return true
  }
}
