import { appLabel } from '@/data/orchestra'
import { giveAccess, removeAccess, removeStorage, saveStorage, setBackupKey } from '@/functions/backup.func'
import { base64url, fromBase64url, institutionKey, needsSecret, newRecoveryPhrase, readRecoveryPhrase, seal, storageContext } from '@/lib/seal'
import * as m from '@/paraglide/messages'
import { Button } from '@pleadli/ui/button'
import { Checkbox } from '@pleadli/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@pleadli/ui/dialog'
import { t } from '@pleadli/ui/goey-toaster'
import { Group, GroupRow } from '@pleadli/ui/grouped'
import { Input } from '@pleadli/ui/input'
import { Segmented } from '@pleadli/ui/segmented'
import { Textarea } from '@pleadli/ui/textarea'
import { createFileRoute, getRouteApi, useRouter } from '@tanstack/react-router'
import { useMemo, useState } from 'react'

export const Route = createFileRoute('/_protected/orchestra/$orgId/backups')({
  component: RouteComponent,
})

const institutionRoute = getRouteApi('/_protected/orchestra/$orgId')
type Data = ReturnType<typeof institutionRoute.useLoaderData>
type Machine = Data['computers'][number]
type Storage = Data['storage'][number]
type Kind = 's3' | 'folder' | 'sftp'
type Fields = Record<string, string>

function size(bytes: number | null) {
  if (!bytes) return ''
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let n = bytes
  let i = 0
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024
    i++
  }
  return `${n.toFixed(n < 10 && i > 0 ? 1 : 0)} ${units[i]}`
}

const kindName = (kind: string) => (kind === 's3' ? m["orch.bk.st.kind.s3"]() : kind === 'sftp' ? m["orch.bk.st.kind.sftp"]() : m["orch.bk.st.kind.folder"]())

function summary(s: Storage) {
  const v = s.settings
  if (s.kind === 's3') return `${v.bucket}${v.prefix ? `/${v.prefix}` : ''} · ${String(v.endpoint).replace(/^https?:\/\//, '')}`
  if (s.kind === 'sftp') return `${v.username}@${v.host}${v.path ? `:${v.path}` : ''}`
  return String(v.path)
}

const failed = (e: unknown) => t.error(m["orch.failed"](), { description: e instanceof Error ? e.message : undefined })

/** Seals the secret in this browser for each computer, under a context that
 * names the storage and the computer. A folder has no secret to seal. */
async function sealFor(storageId: string, kind: string, machines: Machine[], secret: Fields) {
  const plain = needsSecret(kind) ? new TextEncoder().encode(JSON.stringify(secret)) : null
  return Promise.all(
    machines.map(async (c) => ({
      computerId: c.id,
      sealKey: c.sealKey!,
      sealed: plain ? await seal(fromBase64url(c.sealKey!), plain, storageContext(storageId, c.id)) : null,
    })),
  )
}

function secretComplete(kind: string, secret: Fields) {
  if (kind === 's3') return !!secret.accessKeyId?.trim() && !!secret.secretAccessKey?.trim()
  if (kind === 'sftp') return !!secret.password || !!secret.privateKey?.trim()
  return true
}

/** Facts about backups, never the backups: they go from each computer to the
 * institution's own storage, locked with a key only its recovery phrase opens. */
function RouteComponent() {
  const data = institutionRoute.useLoaderData()
  const { institution, role, backupKey, storage, seals, computers, backups, offices } = data
  const router = useRouter()
  const [phraseOpen, setPhraseOpen] = useState(false)
  const [editing, setEditing] = useState<Storage | 'new' | null>(null)
  const [granting, setGranting] = useState<{ storage: Storage; machines: Machine[] } | null>(null)

  // Only computers whose app sent a seal key can be given access.
  const ready = computers.filter((c) => c.sealKey && c.licenceId)
  const has = (storageId: string, computerId: string) => seals.some((s) => s.storageId === storageId && s.computerId === computerId)
  const waiting = (s: Storage) => ready.filter((c) => !has(s.id, c.id))
  const officeName = (unitId: string | null) => offices.find((o) => o.id === unitId)?.name

  const take = async (s: Storage, c: Machine) => {
    try {
      await removeAccess({ data: { organizationId: institution.id, storageId: s.id, computerId: c.id } })
      t.success(m["orch.bk.pc.removed"]())
      void router.invalidate()
    } catch (e) {
      failed(e)
    }
  }

  return (
    <article className="container flex flex-col gap-6 py-10 md:max-w-4xl">
      <header>
        <h1>{m["orch.nav.backups"]()}</h1>
        <p className="text-muted-foreground">{m["orch.bk.lead"]()}</p>
      </header>

      <Group title={m["orch.bk.key.title"]()}>
        {backupKey ? (
          <GroupRow
            label={m["orch.bk.key.fingerprint"]()}
            detail={m["orch.bk.key.made"]({ date: new Date(backupKey.createdAt).toLocaleDateString() })}
            value={
              <span className="flex items-center gap-3">
                <span className="font-mono">{backupKey.fingerprint}</span>
                {role === 'owner' && (
                  <Button size="sm" variant="ghost" onClick={() => setPhraseOpen(true)}>
                    {m["orch.bk.key.replace"]()}
                  </Button>
                )}
              </span>
            }
          />
        ) : (
          <GroupRow
            label={m["orch.bk.key.none"]()}
            detail={role === 'owner' ? m["orch.bk.key.none_body"]() : m["orch.bk.key.owner_only"]()}
            value={role === 'owner' ? <Button size="sm" onClick={() => setPhraseOpen(true)}>{m["orch.bk.key.setup"]()}</Button> : undefined}
          />
        )}
      </Group>

      <Group
        title={m["orch.bk.storage"]()}
        action={
          <Button size="sm" variant="secondary" disabled={!backupKey} onClick={() => setEditing('new')}>
            {m["orch.bk.st.add"]()}
          </Button>
        }
        footer={!backupKey ? m["orch.bk.st.needs_key"]() : undefined}
      >
        {storage.length === 0 && <GroupRow label={m["orch.bk.storage_none"]()} />}
        {storage.map((s) => {
          const count = ready.filter((c) => has(s.id, c.id)).length
          const queue = waiting(s)
          return (
            <GroupRow
              key={s.id}
              label={s.label}
              detail={[kindName(s.kind), summary(s), m["orch.bk.st.with_access"]({ n: count })].join(' · ')}
              value={
                queue.length > 0 ? (
                  <Button
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation()
                      setGranting({ storage: s, machines: queue })
                    }}
                  >
                    {m["orch.bk.pc.give"]()} ({queue.length})
                  </Button>
                ) : undefined
              }
              chevron
              onClick={() => setEditing(s)}
            />
          )
        })}
      </Group>

      <Group title={m["orch.bk.pc.title"]()}>
        {ready.length === 0 && <GroupRow label={m["orch.bk.pc.none"]()} />}
        {ready.map((c) => {
          const last = backups.find((b) => b.computerId === c.id)
          return (
            <GroupRow
              key={c.id}
              label={[appLabel(c.application), officeName(c.unitId)].filter(Boolean).join(' · ')}
              detail={[c.os, last ? m["orch.bk.pc.last"]({ date: new Date(last.at).toLocaleString() }) : m["orch.bk.pc.never"]()].filter(Boolean).join(' · ')}
              value={
                <span className="flex flex-wrap justify-end gap-2">
                  {storage.map((s) =>
                    has(s.id, c.id) ? (
                      <Button key={s.id} size="sm" variant="ghost" title={m["orch.bk.pc.remove"]()} onClick={() => void take(s, c)}>
                        {s.label}: {m["orch.bk.pc.has"]()} ×
                      </Button>
                    ) : (
                      <Button key={s.id} size="sm" variant="secondary" onClick={() => setGranting({ storage: s, machines: [c] })}>
                        {s.label}: {m["orch.bk.pc.give"]()}
                      </Button>
                    ),
                  )}
                </span>
              }
            />
          )
        })}
      </Group>

      <Group title={m["orch.bk.history"]()}>
        {backups.length === 0 && <GroupRow label={m["orch.bk.empty"]()} />}
        {backups.map((b) => {
          const machine = computers.find((c) => c.id === b.computerId)
          return (
            <GroupRow
              key={b.id}
              label={new Date(b.at).toLocaleString()}
              detail={[machine && appLabel(machine.application), storage.find((s) => s.id === b.storageId)?.label, size(b.sizeBytes), b.message].filter(Boolean).join(' · ')}
              value={<span className={b.ok ? '' : 'text-destructive'}>{b.ok ? m["orch.bk.ok"]() : m["orch.bk.failed"]()}</span>}
            />
          )
        })}
      </Group>

      {phraseOpen && <PhraseDialog organizationId={institution.id} replace={!!backupKey} onClose={() => setPhraseOpen(false)} />}
      {editing && <StorageDialog organizationId={institution.id} storage={editing === 'new' ? null : editing} machines={ready} has={has} onClose={() => setEditing(null)} />}
      {granting && <AccessDialog organizationId={institution.id} storage={granting.storage} machines={granting.machines} onClose={() => setGranting(null)} />}
    </article>
  )
}

/** Makes the recovery phrase here, asks for two of its groups back, and sends
 * only the public key. The phrase is gone when the dialog closes. */
function PhraseDialog({ organizationId, replace, onClose }: { organizationId: string; replace: boolean; onClose: () => void }) {
  const router = useRouter()
  const phrase = useMemo(() => newRecoveryPhrase(), [])
  const groups = phrase.split('-')
  const [ask] = useState(() => {
    const a = 1 + Math.floor(Math.random() * 4)
    return [a, a + 1 + Math.floor(Math.random() * (8 - a))] as const
  })
  const [step, setStep] = useState<'show' | 'check'>('show')
  const [typed, setTyped] = useState(['', ''])
  const [wrong, setWrong] = useState(false)
  const [busy, setBusy] = useState(false)

  const print = () => {
    const w = window.open('', '_blank', 'width=640,height=480')
    if (!w) return
    w.document.title = m["orch.bk.setup.print_title"]()
    const h = w.document.createElement('h1')
    h.textContent = m["orch.bk.setup.print_title"]()
    const p = w.document.createElement('p')
    p.textContent = m["orch.bk.setup.body"]()
    const code = w.document.createElement('pre')
    code.style.font = '600 28px/1.6 ui-monospace, monospace'
    code.textContent = groups.map((g, i) => `${i + 1}. ${g}`).join('\n')
    w.document.body.style.fontFamily = 'system-ui, sans-serif'
    for (const el of [h, p, code]) w.document.body.appendChild(el)
    w.print()
  }

  const finish = async () => {
    const norm = (s: string) => s.toUpperCase().replace(/O/g, '0').replace(/[IL]/g, '1').replace(/[^0-9A-Z]/g, '')
    if (norm(typed[0]) !== groups[ask[0] - 1] || norm(typed[1]) !== groups[ask[1] - 1]) {
      setWrong(true)
      return
    }
    setBusy(true)
    try {
      const { publicKey } = institutionKey(readRecoveryPhrase(phrase)!)
      await setBackupKey({ data: { organizationId, publicKey: base64url(publicKey), replace } })
      t.success(m["orch.bk.setup.done"]())
      onClose()
      void router.invalidate()
    } catch (e) {
      failed(e)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{step === 'show' ? m["orch.bk.setup.title"]() : m["orch.bk.setup.confirm_title"]()}</DialogTitle>
          <DialogDescription>{step === 'show' ? m["orch.bk.setup.body"]() : m["orch.bk.setup.confirm_body"]({ a: ask[0], b: ask[1] })}</DialogDescription>
        </DialogHeader>
        {step === 'show' ? (
          <>
            {replace && <p className="text-destructive">{m["orch.bk.key.replace_warn"]()}</p>}
            <ol className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {groups.map((g, i) => (
                <li key={i} className="flex flex-col items-center rounded-lg bg-muted/60 py-2">
                  <span className="text-muted-foreground">{i + 1}</span>
                  <span className="font-mono font-semibold tracking-widest">{g}</span>
                </li>
              ))}
            </ol>
            <DialogFooter>
              <Button variant="secondary" onClick={print}>
                {m["orch.bk.setup.print"]()}
              </Button>
              <Button onClick={() => setStep('check')}>{m["orch.bk.setup.next"]()}</Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3">
              {ask.map((n, i) => (
                <label key={n} className="flex flex-col gap-1.5">
                  {m["orch.bk.setup.group"]({ n })}
                  <Input
                    className="font-mono uppercase"
                    autoComplete="off"
                    spellCheck={false}
                    value={typed[i]}
                    onChange={(e) => {
                      setWrong(false)
                      setTyped((x) => x.map((v, j) => (j === i ? e.target.value : v)))
                    }}
                  />
                </label>
              ))}
            </div>
            {wrong && <p className="text-destructive">{m["orch.bk.setup.wrong"]()}</p>}
            <DialogFooter>
              <Button variant="secondary" onClick={() => setStep('show')}>
                {m["orch.bk.setup.back"]()}
              </Button>
              <Button onClick={() => void finish()} disabled={busy || !typed[0] || !typed[1]}>
                {m["orch.bk.setup.finish"]()}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

/** `secret` keeps the browser's password manager out: a storage key next to a
 * password box otherwise looks like a sign-in, and saved logins get filled in. */
function Text({ label, hint, value, onChange, type, mono, secret }: { label: string; hint?: string; value: string; onChange: (v: string) => void; type?: string; mono?: boolean; secret?: boolean }) {
  return (
    <label className="flex flex-col gap-1.5">
      {label}
      <Input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={secret ? 'new-password' : 'off'}
        data-1p-ignore={secret || undefined}
        data-lpignore={secret ? 'true' : undefined}
        spellCheck={false}
        className={mono ? 'font-mono' : undefined}
      />
      {hint && <span className="text-muted-foreground">{hint}</span>}
    </label>
  )
}

function SettingsFields({ kind, value, set }: { kind: Kind; value: Fields; set: (k: string, v: string) => void }) {
  if (kind === 's3')
    return (
      <>
        <Text label={m["orch.bk.st.endpoint"]()} hint={m["orch.bk.st.endpoint_hint"]()} value={value.endpoint ?? ''} onChange={(v) => set('endpoint', v)} type="url" />
        <div className="grid grid-cols-2 gap-3">
          <Text label={m["orch.bk.st.bucket"]()} value={value.bucket ?? ''} onChange={(v) => set('bucket', v)} />
          <Text label={m["orch.bk.st.region"]()} value={value.region ?? ''} onChange={(v) => set('region', v)} />
        </div>
        <Text label={m["orch.bk.st.prefix"]()} value={value.prefix ?? ''} onChange={(v) => set('prefix', v)} />
      </>
    )
  if (kind === 'sftp')
    return (
      <>
        <div className="grid grid-cols-[1fr_6rem] gap-3">
          <Text label={m["orch.bk.st.host"]()} value={value.host ?? ''} onChange={(v) => set('host', v)} />
          <Text label={m["orch.bk.st.port"]()} value={value.port ?? '22'} onChange={(v) => set('port', v)} type="number" />
        </div>
        <Text label={m["orch.bk.st.username"]()} value={value.username ?? ''} onChange={(v) => set('username', v)} secret />
        <Text label={m["orch.bk.st.folder"]()} value={value.path ?? ''} onChange={(v) => set('path', v)} />
        <Text label={m["orch.bk.st.host_key"]()} hint={m["orch.bk.st.host_key_hint"]()} value={value.hostKey ?? ''} onChange={(v) => set('hostKey', v)} mono />
      </>
    )
  return <Text label={m["orch.bk.st.path"]()} hint={m["orch.bk.st.path_hint"]()} value={value.path ?? ''} onChange={(v) => set('path', v)} mono />
}

function SecretFields({ kind, value, set, keeping }: { kind: Kind; value: Fields; set: (k: string, v: string) => void; keeping?: boolean }) {
  if (!needsSecret(kind)) return null
  return (
    <fieldset className="flex flex-col gap-3 rounded-xl bg-muted/50 p-3">
      <legend className="sr-only">{m["orch.bk.st.secret"]()}</legend>
      {kind === 's3' ? (
        <>
          <Text label={m["orch.bk.st.access_key"]()} value={value.accessKeyId ?? ''} onChange={(v) => set('accessKeyId', v)} mono secret />
          <Text label={m["orch.bk.st.secret_key"]()} value={value.secretAccessKey ?? ''} onChange={(v) => set('secretAccessKey', v)} type="password" secret />
        </>
      ) : (
        <>
          <Text label={m["orch.bk.st.password"]()} value={value.password ?? ''} onChange={(v) => set('password', v)} type="password" secret />
          <label className="flex flex-col gap-1.5">
            {m["orch.bk.st.private_key"]()}
            <Textarea rows={3} className="font-mono" spellCheck={false} value={value.privateKey ?? ''} onChange={(e) => set('privateKey', e.target.value)} />
          </label>
        </>
      )}
      <p className="text-muted-foreground">
        {m["orch.bk.st.secret_note"]()} {keeping && m["orch.bk.st.secret_keep"]()}
      </p>
    </fieldset>
  )
}

/** Plain settings go to pleadli.com as they are; the secret only as seals. */
function settingsPayload(kind: Kind, v: Fields) {
  if (kind === 's3') return { endpoint: v.endpoint ?? '', region: v.region ?? '', bucket: v.bucket ?? '', prefix: v.prefix ?? '' }
  if (kind === 'sftp') return { host: v.host ?? '', port: Number(v.port || 22), username: v.username ?? '', path: v.path ?? '', hostKey: v.hostKey ?? '' }
  return { path: v.path ?? '' }
}

function secretPayload(kind: Kind, v: Fields): Fields {
  if (kind === 's3') return { accessKeyId: v.accessKeyId?.trim() ?? '', secretAccessKey: v.secretAccessKey?.trim() ?? '' }
  return v.privateKey?.trim() ? { privateKey: v.privateKey.trim() } : { password: v.password ?? '' }
}

function StorageDialog({ organizationId, storage, machines, has, onClose }: { organizationId: string; storage: Storage | null; machines: Machine[]; has: (s: string, c: string) => boolean; onClose: () => void }) {
  const router = useRouter()
  const [id] = useState(() => storage?.id ?? crypto.randomUUID())
  const [kind, setKind] = useState<Kind>((storage?.kind as Kind) ?? 's3')
  const [label, setLabel] = useState(storage?.label ?? '')
  const [settings, setSettings] = useState<Fields>(() => Object.fromEntries(Object.entries(storage?.settings ?? {}).map(([k, v]) => [k, String(v)])))
  const [secret, setSecret] = useState<Fields>({})
  const [chosen, setChosen] = useState<string[]>(() => machines.filter((c) => !storage || has(storage.id, c.id)).map((c) => c.id))
  const [busy, setBusy] = useState(false)

  const newSecret = needsSecret(kind) && Object.values(secret).some((v) => v.trim())
  // A new storage, or a new secret, needs seals; otherwise access stays as it is,
  // apart from computers ticked or unticked here.
  const canSave = label.trim() && (storage ? !newSecret || secretComplete(kind, secret) : secretComplete(kind, secret))

  const save = async () => {
    setBusy(true)
    try {
      const picked = machines.filter((c) => chosen.includes(c.id))
      const fresh = storage && !newSecret && needsSecret(kind) ? [] : picked
      const seals = await sealFor(id, kind, fresh, secretPayload(kind, secret))
      await saveStorage({ data: { organizationId, id, label: label.trim(), kind, settings: settingsPayload(kind, settings), seals } })
      if (storage) {
        for (const c of machines) if (has(storage.id, c.id) && !chosen.includes(c.id)) await removeAccess({ data: { organizationId, storageId: storage.id, computerId: c.id } })
      }
      t.success(m["orch.bk.st.saved"]())
      onClose()
      void router.invalidate()
    } catch (e) {
      failed(e)
    } finally {
      setBusy(false)
    }
  }

  const remove = async () => {
    if (!storage) return
    setBusy(true)
    try {
      await removeStorage({ data: { organizationId, storageId: storage.id } })
      t.success(m["orch.bk.st.removed"]())
      onClose()
      void router.invalidate()
    } catch (e) {
      failed(e)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{storage ? storage.label : m["orch.bk.st.add"]()}</DialogTitle>
          {storage && <DialogDescription>{kindName(storage.kind)}</DialogDescription>}
        </DialogHeader>
        {!storage && (
          <Segmented
            label={m["orch.bk.st.edit"]()}
            value={kind}
            onChange={setKind}
            items={[
              { value: 's3', label: m["orch.bk.st.kind.s3"]() },
              { value: 'folder', label: m["orch.bk.st.kind.folder"]() },
              { value: 'sftp', label: m["orch.bk.st.kind.sftp"]() },
            ]}
          />
        )}
        <Text label={m["orch.bk.st.label"]()} hint={m["orch.bk.st.label_hint"]()} value={label} onChange={setLabel} />
        <SettingsFields kind={kind} value={settings} set={(k, v) => setSettings((s) => ({ ...s, [k]: v }))} />
        <SecretFields kind={kind} value={secret} set={(k, v) => setSecret((s) => ({ ...s, [k]: v }))} keeping={!!storage} />
        <section className="flex flex-col gap-2">
          <h3>{m["orch.bk.st.give_to"]()}</h3>
          {machines.length === 0 && <p className="text-muted-foreground">{m["orch.bk.st.no_computers"]()}</p>}
          {machines.map((c) => (
            <label key={c.id} className="flex items-center gap-2">
              <Checkbox checked={chosen.includes(c.id)} onCheckedChange={(v) => setChosen((x) => (v ? [...x, c.id] : x.filter((y) => y !== c.id)))} />
              {appLabel(c.application)}
              <span className="text-muted-foreground">{c.os}</span>
            </label>
          ))}
        </section>
        <DialogFooter>
          {storage && (
            <Button variant="ghost" className="text-destructive sm:me-auto" onClick={() => void remove()} disabled={busy}>
              {m["orch.bk.st.remove"]()}
            </Button>
          )}
          <Button onClick={() => void save()} disabled={busy || !canSave}>
            {m["orch.bk.st.save"]()}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** Gives waiting computers access: the secret is typed once and sealed to each. */
function AccessDialog({ organizationId, storage, machines, onClose }: { organizationId: string; storage: Storage; machines: Machine[]; onClose: () => void }) {
  const router = useRouter()
  const kind = storage.kind as Kind
  const [secret, setSecret] = useState<Fields>({})
  const [busy, setBusy] = useState(false)

  const give = async () => {
    setBusy(true)
    try {
      const seals = await sealFor(storage.id, kind, machines, secretPayload(kind, secret))
      await giveAccess({ data: { organizationId, storageId: storage.id, seals } })
      t.success(m["orch.bk.pc.given"]())
      onClose()
      void router.invalidate()
    } catch (e) {
      failed(e)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{m["orch.bk.pc.give"]()}</DialogTitle>
          <DialogDescription>
            {storage.label} · {machines.map((c) => `${appLabel(c.application)}${c.os ? ` (${c.os})` : ''}`).join(', ')}
          </DialogDescription>
        </DialogHeader>
        <SecretFields kind={kind} value={secret} set={(k, v) => setSecret((s) => ({ ...s, [k]: v }))} />
        <DialogFooter>
          <Button onClick={() => void give()} disabled={busy || !secretComplete(kind, secret)}>
            {m["orch.bk.pc.give"]()}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
