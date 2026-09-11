type ProseMirrorNode = {
  type?: string
  text?: string
  content?: ProseMirrorNode[]
}

/**
 * Parses a stored value into a Tiptap document, tolerating plain text that
 * was never actually produced by this editor — seed data, values written
 * directly by an API call, or anything imported from a plain-text source.
 * `JSON.parse` on a bare string like "Charge sheet (draft), ..." throws
 * ("Unexpected identifier"), which crashed both RichTextInput and
 * RichTextPreview until this existed.
 *
 * Two distinct failure modes are handled, not just one: `value` can fail to
 * parse at all (a syntax error), or it can parse successfully into
 * something that isn't actually a ProseMirror document — a bare JSON
 * number/string/array, or an unrelated object (e.g. `"221"` or `"true"`
 * both parse fine but aren't a doc). A `JSON.parse` success on its own
 * doesn't mean the shape is safe to hand to Tiptap; only a real object with
 * `type === 'doc'` is. Either failure mode falls back to wrapping the raw
 * string as a single paragraph, so old/foreign content still displays and
 * edits instead of crashing the app or the editor further downstream.
 */
export function safeParseRichTextDoc(value: string | null | undefined): ProseMirrorNode | '' {
  if (!value) return ''

  const asPlainTextDoc = (): ProseMirrorNode => ({
    type: 'doc',
    content: [{ type: 'paragraph', content: [{ type: 'text', text: value }] }],
  })

  let parsed: unknown
  try {
    parsed = JSON.parse(value)
  } catch {
    return asPlainTextDoc()
  }

  if (parsed && typeof parsed === 'object' && (parsed as ProseMirrorNode).type === 'doc') {
    return parsed as ProseMirrorNode
  }
  return asPlainTextDoc()
}

/**
 * Flattens a serialized editor-document JSON string into plain text (block
 * boundaries become spaces). For previews/search, not for re-editing.
 */
export function richTextToPlainText(json: string | null | undefined): string {
  if (!json) return ''

  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch {
    return json.trim()
  }
  if (!(parsed && typeof parsed === 'object' && (parsed as ProseMirrorNode).type === 'doc')) {
    return json.trim()
  }

  const doc = parsed as ProseMirrorNode
  const parts: string[] = []
  const walk = (node: ProseMirrorNode | undefined) => {
    if (!node) return
    if (typeof node.text === 'string') parts.push(node.text)
    node.content?.forEach(walk)
  }
  walk(doc)
  return parts.join(' ').replace(/\s+/g, ' ').trim()
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
    // Not a serialized editor document — plain text (seed data, an API
    // call, an import). It's "empty" only if the raw string itself is.
    return json.trim().length === 0
  }
}
