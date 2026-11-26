import { ChoiceSelect } from '@/components/choice-select'
import { Button } from '@pleadli/ui/button'
import { Delete02Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Link } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import * as m from '@/paraglide/messages'
import { Tag } from '@/components/status-tag'
import { addFileLink, listFileLinks, removeFileLink, listFiles } from './data'
import { linkRelations } from './schema'

const coverClass: Record<string, string> = {
  pink: 'bg-pink-300',
  yellow: 'bg-yellow-300',
  green: 'bg-green-400',
  blue: 'bg-blue-400',
  white: 'bg-muted ring-1 ring-border',
}

/** The files that belong to the same matter: the trial, a bail application, an
 * appeal. Each keeps its own number and cover colour (spec 0001, AC-6). */
export function LinkedFiles({ fileId }: { fileId: string }) {
  const qc = useQueryClient()
  const key = ['prosecution-files', 'links', fileId] as const
  const { data: links = [] } = useQuery({ queryKey: key, queryFn: () => listFileLinks(fileId) })
  const { data: others = [] } = useQuery({ queryKey: ['prosecution-files', 'list', 'all', ''], queryFn: () => listFiles('all', '') })
  const [target, setTarget] = useState('')
  const [relation, setRelation] = useState<(typeof linkRelations)[number]>('related')
  const refresh = () => qc.invalidateQueries({ queryKey: key })
  const add = useMutation({ mutationFn: () => addFileLink(fileId, target, relation), onSuccess: () => { setTarget(''); void refresh() } })
  const remove = useMutation({ mutationFn: (id: string) => removeFileLink(id), onSuccess: refresh })
  const taken = new Set([fileId, ...links.map((l) => l.fileId)])
  const choices = others.filter((f) => !taken.has(f.id))

  return (
    <section className="page-section">
      <h2>{m["file.links.title"]()}</h2>
      {links.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-4 text-muted-foreground">{m["file.links.none"]()}</p>
      ) : (
        <div role="list" className="flex flex-col divide-y divide-border/60 border-y border-border/60">
          {links.map((l) => (
            <div key={l.linkId} role="listitem" className="flex items-center justify-between gap-3 py-2">
              <Link to="/files/$fileId" params={{ fileId: l.fileId }} className="flex min-w-0 items-center gap-2 no-underline">
                <span aria-hidden className={`size-3 shrink-0 rounded-sm ${coverClass[l.cover] ?? coverClass.white}`} />
                <Tag tone="neutral">{m[`file.links.relation.${l.relation}`]()}</Tag>
                <span className="truncate">{l.title}</span>
                {l.reference && <span className="truncate text-muted-foreground">{l.reference}</span>}
              </Link>
              <Button size="icon-sm" variant="ghost" onClick={() => remove.mutate(l.linkId)} aria-label={l.title}>
                <HugeiconsIcon icon={Delete02Icon} />
              </Button>
            </div>
          ))}
        </div>
      )}
      {choices.length > 0 && (
        <form
          className="mt-3 flex flex-wrap items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            if (target) add.mutate()
          }}
        >
          <ChoiceSelect aria-label={m["file.links.add"]()} value={target} onChange={(e) => setTarget(e.target.value)} className="h-9 max-w-xs rounded-md border border-border bg-background px-2">
            <option value="">{m["file.links.add"]()}</option>
            {choices.map((f) => (
              <option key={f.id} value={f.id}>{f.title}</option>
            ))}
          </ChoiceSelect>
          <ChoiceSelect aria-label="relation" value={relation} onChange={(e) => setRelation(e.target.value as typeof relation)} className="h-9 rounded-md border border-border bg-background px-2">
            {linkRelations.map((r) => (
              <option key={r} value={r}>{m[`file.links.relation.${r}`]()}</option>
            ))}
          </ChoiceSelect>
          <Button type="submit" size="sm" disabled={!target || add.isPending}>{m["file.links.add"]()}</Button>
        </form>
      )}
    </section>
  )
}
