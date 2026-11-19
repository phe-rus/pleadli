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
import { useState } from 'react'

const say = (error: unknown) => (error instanceof ApiError ? error.message : 'Try again.')
const roleLabel: Record<StaffRole, string> = { administrator: 'Administrator', judicial_officer: 'Judicial officer', registrar: 'Registrar' }
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
      t.error('Could not save.', { description: say(error) })
    }
  }
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border p-3">
      <div className="flex flex-wrap gap-2">
        <Input aria-label="Rank or title" placeholder="Rank or title" value={rank} onChange={(e) => setRank(e.target.value)} className="w-48" />
        <select aria-label="Role" className="h-9 rounded-md border border-input bg-background px-2" value={role} onChange={(e) => setRole(e.target.value as StaffRole)}>
          {staffRoles.map((r) => (
            <option key={r} value={r}>
              {roleLabel[r]}
            </option>
          ))}
        </select>
        <Button size="sm" onClick={() => void run(() => updateStaff(person.id, { name: person.name, rank: rank.trim() || null, role, isHead: person.isHead, active: person.active }), 'Saved.').then(onDone)}>
          Save
        </Button>
        <Button size="sm" variant="outline" onClick={() => void run(() => updateStaff(person.id, { name: person.name, rank: person.rank, role: person.role, isHead: person.isHead, active: !person.active }), person.active ? 'Switched off.' : 'Switched on.').then(onDone)}>
          {person.active ? 'Switch off' : 'Switch on'}
        </Button>
      </div>
      {level !== 'none' && (
        <div className="flex flex-col gap-2">
          <Secret level={level === 'basic' ? 'basic' : 'full'} value={secret} onChange={setSecret} label={level === 'basic' ? 'New 6-digit PIN' : 'New password (12 or more characters)'} />
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" disabled={!secretOk(level === 'basic' ? 'basic' : 'full', secret)} onClick={() => void run(() => setStaffSecret(person.id, secret), 'New secret set.').then(() => setSecret(''))}>
              Set {level === 'basic' ? 'PIN' : 'password'}
            </Button>
            {level === 'full' && person.hasSecondFactor && (
              <Button size="sm" variant="outline" onClick={() => void run(() => resetSecondFactor(person.id), 'The phone will be linked again at the next sign-in.')}>
                Lost phone: link a new one
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
      title="Add a person"
      onSubmit={async (e) => {
        e.preventDefault()
        try {
          await createStaff({ name: name.trim(), rank: rank.trim() || null, role, isHead: false, secret: needs ? secret : null })
          await queryClient.invalidateQueries({ queryKey: ['installation'] })
          t.success('Person added.')
          onDone()
        } catch (error) {
          t.error('Could not add.', { description: say(error) })
        }
      }}
      action={
        <>
          <Button type="button" size="sm" variant="ghost" onClick={onDone}>
            Cancel
          </Button>
          <Button type="submit" size="sm" disabled={!ready}>
            Add
          </Button>
        </>
      }
    >
      <Input aria-label="Full name" placeholder="Full name" value={name} onChange={(e) => setName(e.target.value)} />
      <div className="flex flex-wrap gap-2">
        <Input aria-label="Rank or title" placeholder="Rank or title" value={rank} onChange={(e) => setRank(e.target.value)} className="w-48" />
        <select aria-label="Role" className="h-9 rounded-md border border-input bg-background px-2" value={role} onChange={(e) => setRole(e.target.value as StaffRole)}>
          {staffRoles.map((r) => (
            <option key={r} value={r}>
              {roleLabel[r]}
            </option>
          ))}
        </select>
      </div>
      {needs && <Secret level={level === 'basic' ? 'basic' : 'full'} value={secret} onChange={setSecret} label={level === 'basic' ? '6-digit PIN' : 'Password (12 or more characters)'} />}
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
        title="People"
        description="Each person signs in as themselves, so the record shows who did what."
        hint={isAdmin ? undefined : 'Only an administrator can change this.'}
        action={
          isAdmin &&
          !adding && (
            <Button size="sm" onClick={() => setAdding(true)}>
              Add a person
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
                summary={[p.rank !== roleLabel[p.role] ? p.rank : null, roleLabel[p.role]].filter(Boolean).join(' · ')}
                trailing={
                  <span className="flex items-center gap-2">
                    {!p.active && <Tag tone="neutral">Off</Tag>}
                    {level === 'full' && p.active && !p.hasSecondFactor && <Tag tone="open">Phone to link</Tag>}
                    {level !== 'none' && p.active && !p.secretKind && <Tag tone="open">No PIN or password</Tag>}
                    {isAdmin && (
                      <Button size="sm" variant="ghost" onClick={() => setEditing(editing === p.id ? null : p.id)}>
                        Edit
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
  const text: Record<Level, string> = { none: 'open, nobody is asked to sign in', basic: 'a 6-digit PIN for everyone', full: 'password and authenticator code' }
  return (
    <SettingsCard
      title="Protection"
      hint={!isAdmin ? 'Only an administrator can change this.' : changing ? 'Everyone else will need a new PIN or password, set under People.' : 'Your records are always encrypted on this computer.'}
      onSubmit={async (e) => {
        e.preventDefault()
        if (!ready) return
        setBusy(true)
        try {
          await setProtection(target, needsSecret ? secret : null)
          setSecret('')
          setNext(null)
          await queryClient.invalidateQueries()
          t.success(`Protection is now: ${text[target]}.`)
        } catch (error) {
          t.error('Could not change it.', { description: say(error) })
        } finally {
          setBusy(false)
        }
      }}
      action={
        isAdmin &&
        changing && (
          <>
            <Button type="button" size="sm" variant="ghost" onClick={() => { setNext(null); setSecret('') }}>
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={!ready || busy}>
              Apply
            </Button>
          </>
        )
      }
    >
      <p>Now {text[level]}.</p>
      {isAdmin && (
        <Segmented
          label="Protection"
          value={target}
          onChange={(v) => setNext(v as Level)}
          items={[
            { value: 'none', label: 'Open' },
            { value: 'basic', label: 'PIN' },
            { value: 'full', label: 'Password + phone' },
          ]}
        />
      )}
      {isAdmin && changing && needsSecret && <Secret level={target === 'basic' ? 'basic' : 'full'} value={secret} onChange={setSecret} label={target === 'basic' ? 'Your new 6-digit PIN' : 'Your new password (12 or more characters)'} />}
    </SettingsCard>
  )
}
