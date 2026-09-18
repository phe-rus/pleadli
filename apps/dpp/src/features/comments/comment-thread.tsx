import { RichTextInput, RichTextPreview, isRichTextEmpty } from '@pleadli/rich-text'
import { Button } from '@pleadli/ui/button'
import { t } from '@pleadli/ui/goey-toaster'
import { cn } from '@pleadli/ui/lib/utils'
import { format } from 'date-fns/format'
import { useState } from 'react'
import { useCommentsForEntity, useCreateComment } from './queries'

export type CommentThreadProps = {
  entityType: string
  entityId: string | null | undefined
  label?: string
}

/**
 * A real comment thread on any structured record (docs/dpp/PRODUCT.md's
 * document-centric convention extended to review commentary) — scoped to
 * the whole record, not anchored to a character range within its rich
 * text. Same generic entity_type/entity_id keying as attachments, so this
 * one component works for statements, evidence items, charges, decisions,
 * and review notes alike.
 */
export function CommentThread({ entityType, entityId, label = 'Comments' }: CommentThreadProps) {
  const id = entityId ?? ''
  const { data: comments } = useCommentsForEntity(entityType, id)
  const createComment = useCreateComment(entityType, id)
  const [draft, setDraft] = useState('')
  const [composing, setComposing] = useState(false)

  if (!entityId) return null

  const handleSubmit = async () => {
    if (isRichTextEmpty(draft)) return
    try {
      await createComment.mutateAsync({ author: '', body: draft })
      setDraft('')
      setComposing(false)
    } catch {
      t.error('Could not post comment', { description: 'Please try again.' })
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        {!composing && (
          <Button type="button" size="xs" variant="ghost" onClick={() => setComposing(true)}>
            Add comment
          </Button>
        )}
      </div>

      {(comments ?? []).length > 0 && (
        <div className="flex flex-col gap-2">
          {comments?.map((comment) => (
            <div key={comment.id} className={cn('rounded-sm border border-input/40 px-2 py-1.5')}>
              <div className="mb-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                <span className="font-medium">{comment.author || 'Unnamed'}</span>
                <span>{format(comment.createdAt, 'PPp')}</span>
              </div>
              <RichTextPreview value={comment.body} className="text-xs" />
            </div>
          ))}
        </div>
      )}

      {composing && (
        <div className="flex flex-col gap-2">
          <RichTextInput value={draft} onChange={setDraft} placeholder="Write a comment…" />
          <div className="flex justify-end gap-2">
            <Button type="button" size="xs" variant="ghost" onClick={() => { setComposing(false); setDraft('') }}>
              Cancel
            </Button>
            <Button type="button" size="xs" onClick={handleSubmit} disabled={createComment.isPending}>
              Post
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
