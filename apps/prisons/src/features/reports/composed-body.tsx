import { RichTextPreview } from '@pleadli/rich-text'
import { m } from '@/paraglide/messages'
import { composedBodySchema } from './schema'
import { ComposedTable } from './tables'

/** A composed report's blocks, in order, as they print: the text as written and
 * each table as chosen. */
export function ComposedBody({ body }: { body: unknown }) {
  const parsed = composedBodySchema.safeParse(body)
  if (!parsed.success) return <p>{m.reports_this_report_could_not_be_read()}</p>
  return (
    <div className="flex flex-col gap-4">
      {parsed.data.blocks.map((block) => (block.type === 'text' ? <RichTextPreview key={block.id} value={block.doc} /> : <ComposedTable key={block.id} block={block} />))}
    </div>
  )
}
