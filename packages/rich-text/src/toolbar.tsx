import { HugeiconsIcon } from '@hugeicons/react'
import { LeftToRightListBulletIcon, LeftToRightListNumberIcon, TextBoldIcon } from '@hugeicons/core-free-icons'
import { Button } from '@pleadli/ui/button'
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@pleadli/ui/select'
import { useEditorState, type Editor } from '@tiptap/react'

const blockTypeOptions = [
  { value: 'paragraph', label: 'Paragraph' },
  { value: 'h1', label: 'Heading 1' },
  { value: 'h2', label: 'Heading 2' },
  { value: 'h3', label: 'Heading 3' },
] as const

type BlockType = (typeof blockTypeOptions)[number]['value']

export function RichTextToolbar({ editor }: { editor: Editor }) {
  const state = useEditorState({
    editor,
    selector: ({ editor }) => ({
      isBold: editor.isActive('bold'),
      isBulletList: editor.isActive('bulletList'),
      isOrderedList: editor.isActive('orderedList'),
      blockType: (['h1', 'h2', 'h3'] as const).find((level) =>
        editor.isActive('heading', { level: Number(level.slice(1)) }),
      ) ?? ('paragraph' as BlockType),
    }),
  })

  const setBlockType = (value: BlockType) => {
    const chain = editor.chain().focus()
    if (value === 'paragraph') {
      chain.setParagraph().run()
    } else {
      chain.toggleHeading({ level: Number(value.slice(1)) as 1 | 2 | 3 }).run()
    }
  }

  return (
    <div className="flex items-center gap-1 border-b border-input/40 p-1">
      <Select
        items={blockTypeOptions}
        value={state.blockType}
        onValueChange={(value) => value && setBlockType(value as BlockType)}
      >
        <SelectTrigger size="sm" className="min-w-28">
          <SelectValue placeholder="Paragraph" />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {blockTypeOptions.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>

      <div className="mx-1 h-4 w-px bg-input/40" />

      <Button
        type="button"
        size="icon-xs"
        variant={state.isBold ? 'default' : 'ghost'}
        aria-label="Bold"
        aria-pressed={state.isBold}
        onClick={() => editor.chain().focus().toggleBold().run()}
      >
        <HugeiconsIcon icon={TextBoldIcon} />
      </Button>
      <Button
        type="button"
        size="icon-xs"
        variant={state.isBulletList ? 'default' : 'ghost'}
        aria-label="Bullet list"
        aria-pressed={state.isBulletList}
        onClick={() => editor.chain().focus().toggleBulletList().run()}
      >
        <HugeiconsIcon icon={LeftToRightListBulletIcon} />
      </Button>
      <Button
        type="button"
        size="icon-xs"
        variant={state.isOrderedList ? 'default' : 'ghost'}
        aria-label="Numbered list"
        aria-pressed={state.isOrderedList}
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
      >
        <HugeiconsIcon icon={LeftToRightListNumberIcon} />
      </Button>
    </div>
  )
}
