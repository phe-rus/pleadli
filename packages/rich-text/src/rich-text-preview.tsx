import { cn } from '@pleadli/ui/lib/utils'
import { EditorContent, useEditor } from '@tiptap/react'
import { richTextExtensions } from './starter-kit'
import { isRichTextEmpty, safeParseRichTextDoc } from './utils'

export type RichTextPreviewProps = {
  value: string | null | undefined
  className?: string
}

/** Read-only rendering of what RichTextInput produces — a second, non-editable
 * Tiptap instance, so the DOM (and therefore the styling) is exactly what was
 * actually written, not a hand-rolled re-render of the JSON. Recreated
 * whenever `value` changes (deps array), since a table cell instance
 * otherwise stays mounted across re-renders and wouldn't pick up an edit. */
export function RichTextPreview({ value, className }: RichTextPreviewProps) {
  const editor = useEditor(
    {
      extensions: richTextExtensions,
      content: safeParseRichTextDoc(value),
      editable: false,
      editorProps: {
        attributes: { class: cn('typeset', className) },
      },
    },
    [value],
  )

  if (isRichTextEmpty(value) || !editor) return null

  return <EditorContent editor={editor} />
}
