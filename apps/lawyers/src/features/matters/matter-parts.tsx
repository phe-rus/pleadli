import { Row, RowList } from '@/components/operational-row'
import { EmptyNote } from '@/components/planned'
import { stageLabel, useMatterTypes } from '@/features/matter-types'
import { messageOf } from '@/lib/api'
import * as m from '@/paraglide/messages'
import { Alert02Icon, Tick02Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Button } from '@pleadli/ui/button'
import { t } from '@pleadli/ui/goey-toaster'
import { Input } from '@pleadli/ui/input'
import { cn } from '@pleadli/ui/lib/utils'
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@pleadli/ui/select'
import { Link } from '@tanstack/react-router'
import { useState } from 'react'
import { useAddParty, useConflicts, useRemoveParty, useSetStage } from './queries'
import { partyRoles, type Matter, type Party, type PartyRole } from './schema'

const roleLabels: Record<string, () => string> = {
  client: () => m["party.role.client"](),
  opposing_party: () => m["party.role.opposing_party"](),
  opposing_counsel: () => m["party.role.opposing_counsel"](),
  co_party: () => m["party.role.co_party"](),
  witness: () => m["party.role.witness"](),
  complainant: () => m["party.role.complainant"](),
  other: () => m["party.role.other"](),
}
export const partyRoleLabel = (role: string) => roleLabels[role]?.() ?? role

/** What the conflict check found for a name, shown as it is typed. A strong
 * hit (every word matches) is a warning; a weak one (one word) is for the
 * advocate to look at. It never blocks: whether it is a conflict is theirs to
 * judge, and the record of who was found stays with them. */
export function ConflictCheck({ name, exceptMatter, asClient = false }: { name: string; exceptMatter?: string; asClient?: boolean }) {
  const { data: found, isFetching } = useConflicts(name, exceptMatter)
  // For the client being chosen, their own other matters are not a conflict:
  // they are said plainly, and only appearing against the practice warns.
  const own = asClient ? (found ?? []).filter((h) => h.role === 'client') : []
  const hits = found && (asClient ? found.filter((h) => h.role !== 'client') : found)
  if (name.trim().length < 3) return null
  if (!hits) return isFetching ? <p className="text-muted-foreground">{m["conflict.checking"]()}</p> : null
  if (hits.length === 0) {
    return (
      <p className="flex items-center gap-1.5 text-muted-foreground">
        <HugeiconsIcon icon={Tick02Icon} className="size-4 text-emerald-600" />
        {own.length > 0 ? m["conflict.own_client"]({ count: own.length }) : m["conflict.none"]({ name: name.trim() })}
      </p>
    )
  }
  const strong = hits.some((h) => h.strong)
  return (
    <div role="status" className={cn('flex flex-col gap-2 rounded-lg border p-3', strong ? 'border-amber-500/50 bg-amber-500/5' : 'border-border bg-muted/30')}>
      <p className="flex items-center gap-1.5">
        <HugeiconsIcon icon={Alert02Icon} className={cn('size-4', strong ? 'text-amber-600' : 'text-muted-foreground')} />
        <strong>{strong ? m["conflict.found_strong"]({ count: hits.length }) : m["conflict.found_weak"]({ count: hits.length })}</strong>
      </p>
      <ul className="flex flex-col gap-1">
        {hits.slice(0, 6).map((h, i) => (
          <li key={i} className="text-muted-foreground">
            <span className="text-foreground">{h.name}</span>, {partyRoleLabel(h.role).toLowerCase()}
            {h.matterId && h.matterTitle && (
              <>
                {' · '}
                <Link to="/matters/$matterId" params={{ matterId: h.matterId }} target="_blank" className="text-primary">
                  {h.matterTitle}
                </Link>
                {h.matterStatus === 'closed' && ` (${m["conflict.closed"]()})`}
              </>
            )}
          </li>
        ))}
      </ul>
      <p className="text-muted-foreground">{m["conflict.judge"]()}</p>
    </div>
  )
}

/** Where the matter stands among its kind's stages. Any stage can be chosen,
 * forward or back: it records where the work is. */
export function StageStepper({ matter }: { matter: Matter }) {
  const { data: types } = useMatterTypes()
  const setStage = useSetStage()
  const stages = types?.find((ty) => ty.id === matter.matterType)?.stages ?? [matter.stage]
  const current = stages.indexOf(matter.stage)
  const open = matter.status === 'open'
  return (
    <nav aria-label={m["stage.title"]()}>
      <ol className="not-typeset m-0 flex list-none flex-wrap gap-1.5 p-0">
        {stages.map((stage, i) => {
          const done = i < current
          const here = i === current
          return (
            <li key={stage}>
              <button
                type="button"
                disabled={!open || here || setStage.isPending}
                aria-current={here ? 'step' : undefined}
                onClick={() =>
                  setStage.mutate(
                    { id: matter.id, stage },
                    { onSuccess: () => t.success(m["stage.moved"]({ stage: stageLabel(stage) })), onError: (error) => t.error(m["stage.move_failed"](), { description: messageOf(error) }) },
                  )
                }
                className={cn(
                  'flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/40',
                  here && 'border-primary bg-primary text-primary-foreground',
                  done && 'border-primary/40 bg-primary/5 text-foreground',
                  !here && !done && 'border-border text-muted-foreground',
                  open && !here && 'hover:border-primary/60 hover:text-foreground',
                )}
              >
                <span className="tabular-nums opacity-70">{i + 1}</span>
                {stageLabel(stage)}
              </button>
            </li>
          )
        })}
      </ol>
    </nav>
  )
}

function Choose<T extends string>({ value, items, onChange, label }: { value: T; items: { value: T; label: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <Select items={items} value={value} onValueChange={(v) => v && onChange(v as T)}>
      <SelectTrigger aria-label={label} className="w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          {items.map((item) => (
            <SelectItem key={item.value} value={item.value}>
              {item.label}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  )
}

/** The other people in a matter. Adding one runs the conflict check on the name. */
export function PartiesSection({ matter, parties }: { matter: Matter; parties: Party[] }) {
  const add = useAddParty()
  const remove = useRemoveParty()
  const [adding, setAdding] = useState(false)
  const [role, setRole] = useState<PartyRole>('opposing_party')
  const [name, setName] = useState('')
  const [organisation, setOrganisation] = useState('')
  const open = matter.status === 'open'

  return (
    <section aria-labelledby="parties" className="page-section">
      <div className="section-head">
        <h2 id="parties">{m["party.title"]()}</h2>
        {open && !adding && (
          <Button size="sm" variant="ghost" onClick={() => setAdding(true)}>
            {m["party.add"]()}
          </Button>
        )}
      </div>
      {adding && (
        <form
          className="flex flex-col gap-3 rounded-lg border border-border bg-muted/30 p-3"
          onSubmit={(e) => {
            e.preventDefault()
            add.mutate(
              { matterId: matter.id, input: { role, name, organisation: organisation.trim() || null, contact: null, notes: null } },
              {
                onSuccess: () => {
                  t.success(m["party.added"]({ name }))
                  setName('')
                  setOrganisation('')
                  setAdding(false)
                },
                onError: (error) => t.error(m["party.add_failed"](), { description: messageOf(error) }),
              },
            )
          }}
        >
          <Choose label={m["party.role_label"]()} value={role} items={partyRoles.map((r) => ({ value: r, label: partyRoleLabel(r) }))} onChange={setRole} />
          <Input aria-label={m["party.name"]()} placeholder={m["party.name"]()} value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          {role === 'opposing_counsel' && <Input aria-label={m["party.firm"]()} placeholder={m["party.firm"]()} value={organisation} onChange={(e) => setOrganisation(e.target.value)} />}
          <ConflictCheck name={name} exceptMatter={matter.id} />
          <div className="flex justify-end gap-2">
            <Button type="button" size="sm" variant="ghost" onClick={() => setAdding(false)}>
              {m["common.cancel"]()}
            </Button>
            <Button type="submit" size="sm" disabled={!name.trim() || add.isPending}>
              {m["party.add"]()}
            </Button>
          </div>
        </form>
      )}
      {parties.length === 0 ? (
        !adding && <EmptyNote>{m["party.none"]()}</EmptyNote>
      ) : (
        <RowList>
          {parties.map((p) => (
            <Row
              key={p.id}
              aligned
              title={p.name}
              summary={[partyRoleLabel(p.role), p.organisation].filter(Boolean).join(' · ')}
              trailing={
                open && (
                  <Button size="sm" variant="ghost" onClick={() => remove.mutate(p.id, { onError: (error) => t.error(m["party.remove_failed"](), { description: messageOf(error) }) })}>
                    {m["party.remove"]()}
                  </Button>
                )
              }
            />
          ))}
        </RowList>
      )}
    </section>
  )
}

