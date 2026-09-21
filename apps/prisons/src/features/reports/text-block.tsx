import { RichTextInput } from '@pleadli/rich-text'
import { cn } from '@pleadli/ui/lib/utils'
import { useState } from 'react'
import { m } from '@/paraglide/messages'
import { docToMarkdown, markdownToDoc } from './markdown'
import type { TextBlock } from './schema'

type Mode = 'write' | 'markdown'

/**
 * A block of written text, editable two ways over the same document: as
 * formatted text with a toolbar, or as Markdown. Switching converts, and the
 * document is what is saved, so neither view can hold something the other
 * cannot show.
 */
export function TextBlockEditor({ block, onChange }: { block: TextBlock; onChange: (doc: string) => void }) {
  const [mode, setMode] = useState<Mode>('write')
  const [markdown, setMarkdown] = useState('')

  const choose = (next: Mode) => {
    if (next === mode) return
    if (next === 'markdown') setMarkdown(docToMarkdown(block.doc))
    setMode(next)
  }

  return (
    <div className="flex flex-col gap-2">
      <div role="tablist" aria-label={m.reports_text_mode()} className="flex w-fit gap-0.5 rounded-md bg-secondary p-0.5">
        {(['write', 'markdown'] as const).map((option) => (
          <button
            key={option}
            type="button"
            role="tab"
            aria-selected={mode === option}
            onClick={() => choose(option)}
            className={cn(
              'cursor-pointer rounded-sm px-2 py-0.5 text-xs transition-colors duration-100 outline-none focus-visible:ring-2 focus-visible:ring-ring/50 motion-reduce:transition-none',
              mode === option ? 'bg-background text-foreground shadow-xs' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {option === 'write' ? m.reports_write() : m.reports_markdown()}
          </button>
        ))}
      </div>
      {mode === 'write' ? (
        <RichTextInput key="write" value={block.doc} onChange={onChange} placeholder={m.reports_write_here()} />
      ) : (
        <textarea
          value={markdown}
          onChange={(event) => {
            setMarkdown(event.target.value)
            onChange(markdownToDoc(event.target.value))
          }}
          spellCheck
          rows={10}
          aria-label={m.reports_markdown()}
          className="min-h-40 w-full resize-y rounded-sm border border-input bg-input/20 px-3 py-2 font-mono text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50 dark:bg-input/30"
        />
      )}
    </div>
  )
}
