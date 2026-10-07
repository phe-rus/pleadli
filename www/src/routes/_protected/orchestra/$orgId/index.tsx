import { CONTACT } from '@/data/contact'
import { typeLabel } from '@/data/orchestra'
import * as m from '@/paraglide/messages'
import { Group, GroupRow } from '@pleadli/ui/grouped'
import { Stat } from '@pleadli/ui/stat'
import { createFileRoute, getRouteApi, useNavigate } from '@tanstack/react-router'

export const Route = createFileRoute('/_protected/orchestra/$orgId/')({
  component: RouteComponent,
})

const institutionRoute = getRouteApi('/_protected/orchestra/$orgId')

/** Where the institution stands: its review, its address, and its figures. */
function RouteComponent() {
  const { institution, offices, computers, licences, backups } = institutionRoute.useLoaderData()
  const navigate = useNavigate()
  const base = `/orchestra/${institution.id}`
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

      <section className="flex flex-col gap-2 rounded-2xl bg-card p-5 ring-1 ring-border/70">
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
          value={lastBackup ? new Date(lastBackup.at).toLocaleDateString() : m["orch.ov.none"]()}
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
