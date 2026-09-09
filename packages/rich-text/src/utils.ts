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
