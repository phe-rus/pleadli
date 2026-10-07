import { approveInstitution, declineInstitution, listInstitutionsStaff, setInstitutionSuspended } from '@/functions/staff.func'
import { Button } from '@pleadli/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@pleadli/ui/dialog'
import { t } from '@pleadli/ui/goey-toaster'
import { Group, GroupRow } from '@pleadli/ui/grouped'
import { Input } from '@pleadli/ui/input'
import { Segmented } from '@pleadli/ui/segmented'
import { Textarea } from '@pleadli/ui/textarea'
import { createFileRoute, useNavigate, useRouter } from '@tanstack/react-router'
import { useState } from 'react'

type View = 'waiting' | 'active' | 'other'

export const Route = createFileRoute('/_protected/admin/institutions')({
  validateSearch: (s: Record<string, unknown>): { open?: string } => (typeof s.open === 'string' ? { open: s.open } : {}),
  loader: () => listInstitutionsStaff(),
  component: RouteComponent,
})

const appName: Record<string, string> = { police: 'Police', dpp: 'DPP', courts: 'Courts', lawyers: 'Lawyers', prisons: 'Prisons' }
type Institution = Awaited<ReturnType<typeof listInstitutionsStaff>>[number]

/** One institution under review: who registered it, what it says it is, its
 * offices, and the address it will receive. Approving issues the addresses. */
function Review({ institution, onDone }: { institution: Institution; onDone: () => void }) {
  const [address, setAddress] = useState(institution.suggestedAddress)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const run = async (fn: () => Promise<unknown>, done: string) => {
    setBusy(true)
    try {
      await fn()
      t.success(done)
      onDone()
    } catch (e) {
      t.error(e instanceof Error ? e.message : 'That did not work.')
    } finally {
      setBusy(false)
    }
  }
  const pending = institution.status === 'pending'
  return (
    <div className="flex flex-col gap-5">
      <Group>
        <GroupRow label="Kind" value={`${institution.kind === 'practice' ? 'Practice' : 'Institution'} · ${appName[institution.institutionType] ?? institution.institutionType}`} />
        <GroupRow label="Country and district" value={[institution.country, institution.district].filter(Boolean).join(' · ')} />
        <GroupRow label="Registered by" value={institution.owner ?? '·'} />
        <GroupRow label="Contact" value={[institution.contactEmail, institution.contactPhone].filter(Boolean).join(' · ') || '·'} />
        {institution.address && <GroupRow label="Address" value={<span className="font-mono">{institution.address}</span>} />}
        {institution.reviewNote && <GroupRow label="Note" detail={institution.reviewNote} />}
      </Group>
      <Group title={`Offices (${institution.offices.length})`}>
        {institution.offices.length === 0 && <GroupRow label="No offices listed yet" />}
        {institution.offices.map((o) => (
          <GroupRow key={o.id} label={o.name} detail={[o.kind, o.district].filter(Boolean).join(' · ')} value={o.address ? <span className="font-mono text-xs">{o.address}</span> : undefined} />
        ))}
      </Group>
      {pending && (
        <>
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">Orchestra address</span>
            <Input value={address} onChange={(e) => setAddress(e.target.value)} className="font-mono" />
            <span className="text-xs text-muted-foreground">country.institution.place. It never changes once issued; each office gets one under it.</span>
          </label>
          <p className="text-sm text-muted-foreground">Approve only once you have confirmed with the institution itself (a call to a known number, a letter) that this registration is genuine.</p>
          <div className="flex flex-wrap gap-2">
            <Button disabled={busy} onClick={() => run(() => approveInstitution({ data: { organizationId: institution.id, address } }), 'Approved, address issued')}>
              Approve and issue address
            </Button>
          </div>
          <label className="flex flex-col gap-1.5 border-t border-border/60 pt-4">
            <span className="text-sm font-medium">Or decline, with the reason the institution will see</span>
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} />
          </label>
          <Button variant="secondary" className="w-fit" disabled={busy || note.trim().length < 3} onClick={() => run(() => declineInstitution({ data: { organizationId: institution.id, note } }), 'Declined')}>
            Decline
          </Button>
        </>
      )}
      {institution.status === 'active' && (
        <Button variant="secondary" className="w-fit" disabled={busy} onClick={() => run(() => setInstitutionSuspended({ data: { organizationId: institution.id, suspended: true } }), 'Suspended')}>
          Suspend
        </Button>
      )}
      {institution.status === 'suspended' && (
        <Button className="w-fit" disabled={busy} onClick={() => run(() => setInstitutionSuspended({ data: { organizationId: institution.id, suspended: false } }), 'Restored')}>
          Restore
        </Button>
      )}
    </div>
  )
}

function RouteComponent() {
  const rows = Route.useLoaderData()
  const { open } = Route.useSearch()
  const navigate = useNavigate()
  const router = useRouter()
  const [view, setView] = useState<View>(rows.some((r) => r.status === 'pending') ? 'waiting' : 'active')
  const shown = rows.filter((r) => (view === 'waiting' ? r.status === 'pending' : view === 'active' ? r.status === 'active' : r.status !== 'pending' && r.status !== 'active'))
  const current = open ? rows.find((r) => r.id === open) : undefined
  const setOpen = (id: string | null) => void navigate({ to: '/admin/institutions', search: id ? { open: id } : {}, replace: true })

  return (
    <article className="container flex flex-col gap-6 py-10 md:max-w-5xl">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1>Institutions</h1>
          <p className="text-muted-foreground">Public institutions and practices registered on the Orchestra.</p>
        </div>
        <Segmented
          label="Show"
          value={view}
          onChange={setView}
          items={[
            { value: 'waiting', label: `Waiting (${rows.filter((r) => r.status === 'pending').length})` },
            { value: 'active', label: 'Active' },
            { value: 'other', label: 'Declined or suspended' },
          ]}
        />
      </header>
      {shown.length === 0 ? (
        <p className="rounded-xl bg-muted/40 p-6 text-center text-muted-foreground">Nothing here.</p>
      ) : (
        <Group>
          {shown.map((r) => (
            <GroupRow
              key={r.id}
              label={r.name}
              detail={[r.kind === 'practice' ? 'Practice' : appName[r.institutionType], r.country, r.district, `${r.offices.length} offices`].filter(Boolean).join(' · ')}
              value={r.address ? <span className="font-mono text-xs">{r.address}</span> : r.requestedAt ? new Date(r.requestedAt).toLocaleDateString() : undefined}
              chevron
              onClick={() => setOpen(r.id)}
            />
          ))}
        </Group>
      )}
      <Dialog open={!!current} onOpenChange={(o) => !o && setOpen(null)}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
          {current && (
            <>
              <DialogHeader>
                <DialogTitle>{current.name}</DialogTitle>
                <DialogDescription>{current.status === 'pending' ? 'Waiting for review' : current.status}</DialogDescription>
              </DialogHeader>
              <Review
                key={current.id}
                institution={current}
                onDone={() => {
                  setOpen(null)
                  void router.invalidate()
                }}
              />
            </>
          )}
        </DialogContent>
      </Dialog>
    </article>
  )
}
