import StarterKit from '@tiptap/starter-kit'

/**
 * Minimal, shared configuration used by both the editable input and the
 * read-only preview, so they always render the same set of block types the
 * same way. Only what the toolbar actually exposes stays enabled — bold,
 * bullet/numbered lists, headings, paragraphs — everything else StarterKit
 * bundles by default (blockquote, code, strike, etc.) is switched off so a
 * markdown shortcut can't produce content the toolbar has no control for.
 */
export const richTextExtensions = [
  StarterKit.configure({
    blockquote: false,
    code: false,
    codeBlock: false,
    horizontalRule: false,
    italic: false,
    strike: false,
    link: false,
    underline: false,
    heading: { levels: [1, 2, 3] },
  }),
]
