import { CONTACT } from '@/data/contact'
import { appLabel, typeLabel } from '@/data/orchestra'
import * as m from '@/paraglide/messages'
import { CheckmarkCircle02Icon, CircleIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Button } from '@pleadli/ui/button'
import { Group, GroupRow } from '@pleadli/ui/grouped'
import { Stat } from '@pleadli/ui/stat'
import { createFileRoute, getRouteApi, Link, useNavigate } from '@tanstack/react-router'
import { cn } from '@pleadli/ui/lib/utils'

export const Route = createFileRoute('/_protected/account/$orgId/')({
  component: RouteComponent,
})

const institutionRoute = getRouteApi('/_protected/account/$orgId')

/** Where the institution stands: its review, its address, and its figures. */
function RouteComponent() {
  const { institution, offices, computers, licences, backups, storage, members, pendingConnections } = institutionRoute.useLoaderData()
  const navigate = useNavigate()
  const base = `/account/${institution.id}`
  const activeLicences = licences.filter((l) => l.status === 'active' && new Date(l.expiresAt).getTime() > Date.now())
  const lastBackup = backups[0]
  const banner =
    institution.status === 'pending'
      ? { title: m["orch.status.pending_title"](), body: m["orch.status.pending"]({ email: institution.contactEmail ?? '', phone: institution.contactPhone ?? '' }), tone: 'bg-primary/[0.08] ring-primary/20' }
      : institution.status === 'declined'
        ? { title: m["orch.status.declined_title"](), body: m["orch.status.declined"]({ note: institution.reviewNote ?? '' }), tone: 'bg-destructive/[0.06] ring-destructive/20' }
        : institution.status === 'suspended'
          ? { title: m["orch.status.suspended_title"](), body: m["orch.status.suspended"](), tone: 'bg-destructive/[0.06] ring-destructive/20' }
          : null

  // What a manager should look at today, worked out from what is already loaded.
  const DAY = 86_400_000
  const now = Date.now()
  const shortDate = (t: number | Date) => new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
  const fullDate = (t: number | Date) => new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
  const ending = activeLicences.filter((l) => new Date(l.expiresAt).getTime() - now < 30 * DAY).sort((a, b) => new Date(a.expiresAt).getTime() - new Date(b.expiresAt).getTime())[0]
  const quiet = computers.filter((c) => now - new Date(c.lastSeenAt).getTime() > 7 * DAY).length
  const lastGood = backups.find((b) => b.ok)
  const invited = members.filter((p) => p.status === 'invited').length
  const attention: { key: string; text: string; to: string }[] = []
  if (institution.status === 'active') {
    if (pendingConnections) attention.push({ key: 'conn', text: m["orch.ov.att.connections"]({ n: pendingConnections }), to: `${base}/postbox` })
    if (ending) attention.push({ key: 'lic', text: m["orch.ov.att.licence_expiring"]({ date: fullDate(ending.expiresAt) }), to: `${base}/licences` })
    if (!activeLicences.length && computers.length) attention.push({ key: 'nolic', text: m["orch.ov.att.no_licence"](), to: `${base}/licences` })
    if (quiet) attention.push({ key: 'quiet', text: m["orch.ov.att.quiet"]({ n: quiet }), to: `${base}/computers` })
    if (computers.length && !storage.length) attention.push({ key: 'nostore', text: m["orch.ov.att.no_storage"](), to: `${base}/backups` })
    else if (backups[0] && !backups[0].ok) attention.push({ key: 'bkfail', text: m["orch.ov.att.backup_failed"](), to: `${base}/backups` })
    else if (storage.length && lastGood && now - new Date(lastGood.at).getTime() > 7 * DAY) attention.push({ key: 'bkold', text: m["orch.ov.att.backup_old"]({ date: shortDate(lastGood.at) }), to: `${base}/backups` })
    if (invited) attention.push({ key: 'inv', text: m["orch.ov.att.invites"]({ n: invited }), to: `${base}/team` })
  }

  // Which apps this institution uses, and on what footing: free, or licensed.
  const apps = [...new Set([...computers.map((c) => c.application), ...licences.map((l) => l.application)])]
  const plan = apps.map((app) => ({
    app,
    computers: computers.filter((c) => c.application === app).length,
    licence: activeLicences.filter((l) => l.application === app).sort((a, b) => new Date(b.expiresAt).getTime() - new Date(a.expiresAt).getTime())[0],
  }))
  const setup = [
    { key: 'install', done: computers.length > 0, label: m["orch.ov.setup.install"](), to: '/downloads' },
    { key: 'licence', done: activeLicences.length > 0, label: m["orch.ov.setup.licence"](), to: `${base}/licences` },
    { key: 'backup', done: storage.length > 0, label: m["orch.ov.setup.backup"](), to: `${base}/backups` },
    { key: 'team', done: members.length > 1, label: m["orch.ov.setup.team"](), to: `${base}/team` },
  ]

  return (
    <article className="container flex flex-col gap-8 py-10 md:max-w-4xl">
      <header>
        <h1>{institution.name}</h1>
        <p className="text-muted-foreground">{[typeLabel(institution.institutionType), institution.district, institution.country].filter(Boolean).join(' · ')}</p>
      </header>

      {banner && (
        <section className={`flex flex-col gap-1 rounded-2xl p-5 ring-1 ${banner.tone}`}>
          <h2 className="text-base! font-semibold">{banner.title}</h2>
          <p>{banner.body}</p>
          {institution.status !== 'pending' && <p className="text-sm text-muted-foreground">{CONTACT.email} · {CONTACT.phone}</p>}
        </section>
      )}

      {institution.status === 'active' && (
        <Group title={m["orch.ov.attention_title"]()}>
          {attention.length ? (
            attention.map((a) => (
              <GroupRow key={a.key} label={a.text} chevron render={({ className, children }) => <Link to={a.to as never} className={className}>{children}</Link>} />
            ))
          ) : (
            <GroupRow label={m["orch.ov.attention_none"]()} />
          )}
        </Group>
      )}

      {institution.status === 'active' && !setup.every((x) => x.done) && (
        <Group title={m["orch.ov.setup_title"]()}>
          {setup.map((x) => (
            <GroupRow
              key={x.key}
              icon={<HugeiconsIcon icon={x.done ? CheckmarkCircle02Icon : CircleIcon} className={x.done ? 'text-green-600 dark:text-green-500' : 'text-muted-foreground/60'} />}
              label={<span className={x.done ? 'text-muted-foreground line-through' : undefined}>{x.label}</span>}
              chevron={!x.done}
              render={x.done ? undefined : ({ className, children }) => <Link to={x.to as never} className={className}>{children}</Link>}
            />
          ))}
        </Group>
      )}

      {institution.status === 'active' && (
        <Group
          title={m["orch.ov.plan_title"]()}
          action={
            !plan.some((p) => p.licence) ? (
              <Button size="xs" variant="secondary" nativeButton={false} render={<Link to={`${base}/licences` as never} />}>
                {m["orch.ov.plan_ask"]()}
              </Button>
            ) : undefined
          }
          footer={m["orch.ov.plan_note"]()}
        >
          {plan.length ? (
            plan.map((p) => (
              <GroupRow
                key={p.app}
                label={appLabel(p.app)}
                detail={m["orch.ov.plan_computers"]({ n: p.computers })}
                value={<span className={p.licence ? 'font-medium text-foreground' : undefined}>{p.licence ? m["orch.ov.plan_licensed"]({ date: fullDate(p.licence.expiresAt) }) : m["orch.ov.plan_free"]()}</span>}
              />
            ))
          ) : (
            <GroupRow label={m["orch.ov.plan_none"]()} />
          )}
        </Group>
      )}

      <section className={cn(
        'flex flex-col gap-1 rounded-2xl bg-card p-5',
        'ring-1 ring-border/70',
      )}>
        <h2 className="text-base! font-semibold">{m["orch.ov.how_title"]()}</h2>
        <p className="text-sm text-muted-foreground">{m["orch.ov.how_apps"]()}</p>
        <p className="text-sm text-muted-foreground">{m["orch.ov.how_here"]()}</p>
      </section>

      <section className={cn(
        'flex flex-col gap-2 rounded-2xl bg-card p-5',
        'ring-1 ring-border/70',
      )}>
        <span className="text-sm text-muted-foreground">{m["orch.address"]()}</span>
        <span className="font-mono text-xl font-semibold">{institution.address ?? m["orch.address_none"]()}</span>
        <p className="text-sm text-muted-foreground">{m["orch.address_hint"]()}</p>
        {institution.address && <p className="text-sm text-muted-foreground">{m["orch.cert_note"]()}</p>}
      </section>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label={m["orch.ov.offices"]()} value={offices.length} onClick={() => void navigate({ to: `${base}/offices` as never })} />
        <Stat label={m["orch.ov.computers"]()} value={computers.length} onClick={() => void navigate({ to: `${base}/computers` as never })} />
        <Stat label={m["orch.ov.licences"]()} value={activeLicences.length} onClick={() => void navigate({ to: `${base}/licences` as never })} />
        <Stat
          label={m["orch.ov.last_backup"]()}
          value={lastBackup ? new Date(lastBackup.at).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) : m["orch.ov.none"]()}
          tone={lastBackup && !lastBackup.ok ? 'urgent' : 'plain'}
          onClick={() => void navigate({ to: `${base}/backups` as never })}
        />
      </section>

      <Group title={m["orch.ov.details"]()}>
        <GroupRow label={m["orch.reg.email"]()} value={institution.contactEmail ?? '·'} />
        <GroupRow label={m["orch.reg.phone"]()} value={institution.contactPhone ?? '·'} />
      </Group>
    </article>
  )
}
