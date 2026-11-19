import { SettingsCard } from '@/components/settings-card'
import { Row, RowList } from '@/components/operational-row'
import { Tag } from '@/components/status-tag'
import {
  createStaff,
  resetSecondFactor,
  setProtection,
  setStaffSecret,
  staffOptions,
  staffRoles,
  updateStaff,
  securityStatusOptions,
  type Staff,
  type StaffRole,
} from '@/features/installation'
import { ApiError } from '@/lib/api'
import { Button } from '@pleadli/ui/button'
import { t } from '@pleadli/ui/goey-toaster'
import { Input } from '@pleadli/ui/input'
import { PinField } from '@pleadli/ui/pin-field'
import { Segmented } from '@pleadli/ui/segmented'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import * as m from '@/paraglide/messages'
import { useState } from 'react'

const say = (error: unknown) => (error instanceof ApiError ? error.message : m["settings.protection.try_again"]())
const roleLabel = (role: StaffRole) => ({ administrator: m["staff.role.administrator"], judicial_officer: m["staff.role.judicial_officer"], registrar: m["staff.role.registrar"] })[role]()
type Level = 'none' | 'basic' | 'full'
const secretOk = (level: 'basic' | 'full', value: string) => (level === 'basic' ? /^\d{6}$/.test(value) : value.length >= 12)

function useStatus() {
  const { data } = useQuery(securityStatusOptions())
  return { level: (data?.level ?? 'none') as Level, isAdmin: data?.actor?.role === 'administrator', actorId: data?.actor?.id ?? null }
}

function Secret({ level, value, onChange, label }: { level: 'basic' | 'full'; value: string; onChange: (v: string) => void; label: string }) {
  if (level === 'basic') return <PinField label={label} value={value} onChange={onChange} autoComplete="new-password" />
  return <Input type="password" autoComplete="new-password" placeholder={label} value={value} onChange={(e) => onChange(e.target.value)} />
}

function Editor({ person, level, onDone }: { person: Staff; level: Level; onDone: () => void }) {
  const queryClient = useQueryClient()
  const [role, setRole] = useState<StaffRole>(person.role)
  const [rank, setRank] = useState(person.rank ?? '')
  const [secret, setSecret] = useState('')
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['installation'] })
  const run = async (work: () => Promise<unknown>, done: string) => {
    try {
      await work()
      await refresh()
      t.success(done)
    } catch (error) {
      t.error(m["settings.people.save_failed"](), { description: say(error) })
    }
  }
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border p-3">
      <div className="flex flex-wrap gap-2">
        <Input aria-label={m["settings.people.rank"]()} placeholder={m["settings.people.rank"]()} value={rank} onChange={(e) => setRank(e.target.value)} className="w-48" />
        <select aria-label={m["settings.people.role"]()} className="h-9 rounded-md border border-input bg-background px-2" value={role} onChange={(e) => setRole(e.target.value as StaffRole)}>
          {staffRoles.map((r) => (
            <option key={r} value={r}>
              {roleLabel(r)}
            </option>
          ))}
        </select>
        <Button size="sm" onClick={() => void run(() => updateStaff(person.id, { name: person.name, rank: rank.trim() || null, role, isHead: person.isHead, active: person.active }), m["settings.people.saved"]()).then(onDone)}>
          {m["settings.people.save"]()}
        </Button>
        <Button size="sm" variant="outline" onClick={() => void run(() => updateStaff(person.id, { name: person.name, rank: person.rank, role: person.role, isHead: person.isHead, active: !person.active }), person.active ? m["settings.people.switched_off"]() : m["settings.people.switched_on"]()).then(onDone)}>
          {person.active ? m["settings.people.switch_off"]() : m["settings.people.switch_on"]()}
        </Button>
      </div>
      {level !== 'none' && (
        <div className="flex flex-col gap-2">
          <Secret level={level === 'basic' ? 'basic' : 'full'} value={secret} onChange={setSecret} label={level === 'basic' ? m["settings.people.new_pin"]() : m["settings.people.new_password"]()} />
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" disabled={!secretOk(level === 'basic' ? 'basic' : 'full', secret)} onClick={() => void run(() => setStaffSecret(person.id, secret), m["settings.people.secret_set"]()).then(() => setSecret(''))}>
              {level === 'basic' ? m["settings.people.set_pin"]() : m["settings.people.set_password"]()}
            </Button>
            {level === 'full' && person.hasSecondFactor && (
              <Button size="sm" variant="outline" onClick={() => void run(() => resetSecondFactor(person.id), m["settings.people.phone_reset"]())}>
                {m["settings.people.lost_phone"]()}
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function AddPerson({ level, onDone }: { level: Level; onDone: () => void }) {
  const queryClient = useQueryClient()
  const [name, setName] = useState('')
  const [rank, setRank] = useState('')
  const [role, setRole] = useState<StaffRole>('registrar')
  const [secret, setSecret] = useState('')
  const needs = level !== 'none'
  const ready = name.trim() && (!needs || secretOk(level === 'basic' ? 'basic' : 'full', secret))
  return (
    <SettingsCard
      title={m["settings.people.add_title"]()}
      onSubmit={async (e) => {
        e.preventDefault()
        try {
          await createStaff({ name: name.trim(), rank: rank.trim() || null, role, isHead: false, secret: needs ? secret : null })
          await queryClient.invalidateQueries({ queryKey: ['installation'] })
          t.success(m["settings.people.added"]())
          onDone()
        } catch (error) {
          t.error(m["settings.people.add_failed"](), { description: say(error) })
        }
      }}
      action={
        <>
          <Button type="button" size="sm" variant="ghost" onClick={onDone}>
            {m["settings.people.cancel"]()}
          </Button>
          <Button type="submit" size="sm" disabled={!ready}>
            {m["settings.people.add_button"]()}
          </Button>
        </>
      }
    >
      <Input aria-label={m["settings.people.full_name"]()} placeholder={m["settings.people.full_name"]()} value={name} onChange={(e) => setName(e.target.value)} />
      <div className="flex flex-wrap gap-2">
        <Input aria-label={m["settings.people.rank"]()} placeholder={m["settings.people.rank"]()} value={rank} onChange={(e) => setRank(e.target.value)} className="w-48" />
        <select aria-label={m["settings.people.role"]()} className="h-9 rounded-md border border-input bg-background px-2" value={role} onChange={(e) => setRole(e.target.value as StaffRole)}>
          {staffRoles.map((r) => (
            <option key={r} value={r}>
              {roleLabel(r)}
            </option>
          ))}
        </select>
      </div>
      {needs && <Secret level={level === 'basic' ? 'basic' : 'full'} value={secret} onChange={setSecret} label={level === 'basic' ? m["settings.people.pin"]() : m["settings.people.password"]()} />}
    </SettingsCard>
  )
}

/** Who works in this court, and what each can do. An administrator adds and
 * changes people; nobody else can. */
export function PeoplePane() {
  const { level, isAdmin } = useStatus()
  const { data: people } = useQuery(staffOptions())
  const [editing, setEditing] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  return (
    <>
      <SettingsCard
        title={m["settings.people.title"]()}
        description={m["settings.people.desc"]()}
        hint={isAdmin ? undefined : m["settings.people.admin_only"]()}
        action={
          isAdmin &&
          !adding && (
            <Button size="sm" onClick={() => setAdding(true)}>
              {m["settings.people.add"]()}
            </Button>
          )
        }
      >
        <RowList>
          {(people ?? []).map((p) => (
            <div key={p.id} className="flex flex-col gap-2">
              <Row
                aligned
                title={p.name}
                summary={[p.rank !== roleLabel(p.role) ? p.rank : null, roleLabel(p.role)].filter(Boolean).join(' · ')}
                trailing={
                  <span className="flex items-center gap-2">
                    {!p.active && <Tag tone="neutral">{m["settings.people.off"]()}</Tag>}
                    {level === 'full' && p.active && !p.hasSecondFactor && <Tag tone="open">{m["settings.people.phone_pending"]()}</Tag>}
                    {level !== 'none' && p.active && !p.secretKind && <Tag tone="open">{m["settings.people.no_secret"]()}</Tag>}
                    {isAdmin && (
                      <Button size="sm" variant="ghost" onClick={() => setEditing(editing === p.id ? null : p.id)}>
                        {m["settings.people.edit"]()}
                      </Button>
                    )}
                  </span>
                }
              />
              {editing === p.id && <Editor person={p} level={level} onDone={() => setEditing(null)} />}
            </div>
          ))}
        </RowList>
      </SettingsCard>
      {adding && <AddPerson level={level} onDone={() => setAdding(false)} />}
    </>
  )
}

/** What it takes to open the court's records on this computer. */
export function ProtectionPane() {
  const queryClient = useQueryClient()
  const { level, isAdmin } = useStatus()
  const { data } = useQuery(securityStatusOptions())
  const [next, setNext] = useState<Level | null>(null)
  const [secret, setSecret] = useState('')
  const [busy, setBusy] = useState(false)
  if (!data?.level) return null
  const target: Level = next ?? level
  const needsSecret = target !== 'none'
  const changing = target !== level
  const ready = changing && (!needsSecret || secretOk(target === 'basic' ? 'basic' : 'full', secret))
  const text: Record<Level, string> = { none: m["settings.protection.level_none"](), basic: m["settings.protection.level_basic"](), full: m["settings.protection.level_full"]() }
  return (
    <SettingsCard
      title={m["settings.protection.title"]()}
      hint={!isAdmin ? m["settings.people.admin_only"]() : changing ? m["settings.protection.hint_change"]() : m["settings.protection.hint_encrypted"]()}
      onSubmit={async (e) => {
        e.preventDefault()
        if (!ready) return
        setBusy(true)
        try {
          await setProtection(target, needsSecret ? secret : null)
          setSecret('')
          setNext(null)
          await queryClient.invalidateQueries()
          t.success(m["settings.protection.changed"]({ level: text[target] }))
        } catch (error) {
          t.error(m["settings.protection.change_failed"](), { description: say(error) })
        } finally {
          setBusy(false)
        }
      }}
      action={
        isAdmin &&
        changing && (
          <>
            <Button type="button" size="sm" variant="ghost" onClick={() => { setNext(null); setSecret('') }}>
              {m["settings.people.cancel"]()}
            </Button>
            <Button type="submit" size="sm" disabled={!ready || busy}>
              {m["settings.protection.apply"]()}
            </Button>
          </>
        )
      }
    >
      <p>{m["settings.protection.now"]({ level: text[level] })}</p>
      {isAdmin && (
        <Segmented
          label={m["settings.protection.title"]()}
          value={target}
          onChange={(v) => setNext(v as Level)}
          items={[
            { value: 'none', label: m["settings.protection.opt_open"]() },
            { value: 'basic', label: m["settings.protection.opt_pin"]() },
            { value: 'full', label: m["settings.protection.opt_full"]() },
          ]}
        />
      )}
      {isAdmin && changing && needsSecret && <Secret level={target === 'basic' ? 'basic' : 'full'} value={secret} onChange={setSecret} label={target === 'basic' ? m["settings.protection.your_new_pin"]() : m["settings.protection.your_new_password"]()} />}
    </SettingsCard>
  )
}
