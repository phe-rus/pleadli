import { messageOf } from '@/lib/api'
import { api, seg } from '@/lib/api'
import { useActor } from '@/features/installation'
import { staffOptions } from '@/features/installation/queries'
import * as m from '@/paraglide/messages'
import { Button } from '@pleadli/ui/button'
import { Checkbox } from '@pleadli/ui/checkbox'
import { t } from '@pleadli/ui/goey-toaster'
import { Textarea } from '@pleadli/ui/textarea'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { format } from 'date-fns/format'
import { useEffect, useState } from 'react'
import * as z from 'zod'

const accessSchema = z.object({
  restricted: z.boolean(),
  staffIds: z.array(z.string()),
  staff: z.array(z.object({ id: z.string(), name: z.string() })),
  history: z.array(z.object({ at: z.number(), actor: z.string().nullable(), action: z.string(), detail: z.string().nullable() })),
})
export type MatterAccess = z.infer<typeof accessSchema>

export const accessOptions = (matterId: string) => ({
  queryKey: ['matters', 'access', matterId] as const,
  queryFn: async () => accessSchema.parse(await api('GET', `/api/matters/${seg(matterId)}/access`)),
  retry: false,
})

/** Who may see one matter: the information barrier inside the practice. The server decides every request; this is
 * where a partner sets it, changes the list and reads who changed it. Nobody is let in because of their role. */
export function MatterAccessPanel({ matterId, onDone }: { matterId: string; onDone: () => void }) {
  const queryClient = useQueryClient()
  const actor = useActor()
  const { data: access, error } = useQuery(accessOptions(matterId))
  const { data: staff } = useQuery(staffOptions())
  const [restricted, setRestricted] = useState(false)
  const [chosen, setChosen] = useState<string[]>([])
  const [reason, setReason] = useState('')
  useEffect(() => {
    if (access) {
      setRestricted(access.restricted)
      setChosen(access.staffIds)
    }
  }, [access])

  const save = useMutation({
    mutationFn: async () => accessSchema.parse(await api('PUT', `/api/matters/${seg(matterId)}/access`, { body: { restricted, staffIds: chosen, reason: reason.trim() || undefined } })),
    onSuccess: () => {
      t.success(restricted ? m['access.saved_restricted']() : m['access.saved_open']())
      void queryClient.invalidateQueries()
      setReason('')
      onDone()
    },
    onError: (e) => t.error(m['access.save_failed'](), { description: messageOf(e) }),
  })

  if (error) return <p className="p-4 text-muted-foreground">{m['access.not_available']()}</p>
  if (!access) return null
  const me = actor?.id
  // Not on the list, but an administrator: the repair is allowed, and needs a reason that is written to the trail.
  const outside = access.restricted && !!me && !access.staffIds.includes(me)
  const people = (staff ?? []).filter((p) => p.active)
  const toggle = (id: string) => setChosen((now) => (now.includes(id) ? now.filter((x) => x !== id) : [...now, id]))

  return (
    <div className="flex flex-1 flex-col gap-5 overflow-y-auto p-4">
      <label className="flex items-start gap-3">
        <Checkbox checked={restricted} onCheckedChange={(v) => setRestricted(v === true)} aria-label={m['access.restrict']()} />
        <span className="flex flex-col gap-1">
          <strong>{m['access.restrict']()}</strong>
          <span className="text-muted-foreground">{m['access.restrict_help']()}</span>
        </span>
      </label>

      {restricted && (
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-muted-foreground">{m['access.who']()}</legend>
          {people.map((p) => (
            <label key={p.id} className="flex items-center gap-3">
              <Checkbox checked={chosen.includes(p.id)} onCheckedChange={() => toggle(p.id)} aria-label={p.name} />
              <span>
                {p.name}
                {p.id === me && ` (${m['access.you']()})`}
              </span>
            </label>
          ))}
          {chosen.length === 0 && <p className="text-muted-foreground">{m['access.name_one']()}</p>}
        </fieldset>
      )}

      {outside && (
        <div className="flex flex-col gap-2 rounded-lg border border-border bg-card p-3">
          <p>{m['access.outside']()}</p>
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder={m['access.reason_placeholder']()} aria-label={m['access.reason']()} />
        </div>
      )}

      <div className="flex justify-end">
        <Button onClick={() => save.mutate()} disabled={save.isPending || (restricted && chosen.length === 0) || (outside && !reason.trim())}>
          {m['access.save']()}
        </Button>
      </div>

      <section className="flex flex-col gap-2" aria-labelledby="access-history">
        <h3 id="access-history">{m['access.history']()}</h3>
        {access.history.length === 0 ? (
          <p className="text-muted-foreground">{m['access.history_empty']()}</p>
        ) : (
          <ul className="flex flex-col divide-y divide-border/60 border-y border-border/60">
            {access.history.map((h, i) => (
              <li key={i} className="flex flex-col gap-0.5 py-2">
                <span>
                  {h.action === 'matter_access_recovered' ? m['access.recovered']() : m['access.changed']()}
                  {h.actor ? `, ${h.actor}` : ''}
                </span>
                <span className="text-muted-foreground">{format(h.at, 'PPp')}</span>
                {h.detail && <span className="text-muted-foreground">{h.detail}</span>}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
