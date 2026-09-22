import { cn } from '@pleadli/ui/lib/utils'
import { Placeholder } from '@tiptap/extensions'
import { EditorContent, useEditor } from '@tiptap/react'
import { richTextExtensions } from './starter-kit'
import { RichTextToolbar } from './toolbar'
import { safeParseRichTextDoc } from './utils'

export type RichTextInputProps = {
  /** Initial content, as JSON from a previous `onChange` call. Tiptap is
   * uncontrolled — this only seeds the editor once, on mount. */
  value?: string | null
  onChange: (json: string) => void
  placeholder?: string
  className?: string
  /** The editing area's own classes. Defaults to a short, scrolling box; a
   * long document (a judgment) passes a taller one. */
  editorClassName?: string
}

// Tiptap's Placeholder extension renders the hint as a `::before` on the
// actual empty paragraph node itself (via a `data-placeholder` attribute),
// not a separately-positioned overlay element — no absolute positioning to
// get wrong, unlike Lexical's sibling-div approach.
const placeholderOverlayClassName =
  "[&_p.is-editor-empty:first-child]:before:pointer-events-none [&_p.is-editor-empty:first-child]:before:float-left [&_p.is-editor-empty:first-child]:before:h-0 [&_p.is-editor-empty:first-child]:before:text-muted-foreground [&_p.is-editor-empty:first-child]:before:content-[attr(data-placeholder)]"

export function RichTextInput({ value, onChange, placeholder = 'Write here…', className, editorClassName = 'max-h-64' }: RichTextInputProps) {
  const editor = useEditor({
    extensions: [...richTextExtensions, Placeholder.configure({ placeholder })],
    content: safeParseRichTextDoc(value),
    editorProps: {
      attributes: {
        class: cn('typeset min-h-24 overflow-y-auto px-3 py-2 outline-none', editorClassName),
      },
    },
    onUpdate: ({ editor }) => onChange(JSON.stringify(editor.getJSON())),
  })

  if (!editor) return null

  return (
    <div className={cn('rounded-sm border border-input bg-input/20 dark:bg-input/30', className)}>
      <RichTextToolbar editor={editor} />
      <div className={placeholderOverlayClassName}>
        <EditorContent editor={editor} />
      </div>
    </div>
  )
}
