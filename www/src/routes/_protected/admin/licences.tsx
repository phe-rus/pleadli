import { NativeSelect } from '@/components/native-select'
import { closeLicenceRequest, issueLicence, listLicencesStaff, revokeLicence } from '@/functions/staff.func'
import { APPLICATIONS } from '@/lib/orchestra'
import { Button } from '@pleadli/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@pleadli/ui/dialog'
import { t } from '@pleadli/ui/goey-toaster'
import { Group, GroupRow } from '@pleadli/ui/grouped'
import { Input } from '@pleadli/ui/input'
import { createFileRoute, useRouter } from '@tanstack/react-router'
import { useState } from 'react'

export const Route = createFileRoute('/_protected/admin/licences')({
  loader: () => listLicencesStaff(),
  component: RouteComponent,
})

const appName: Record<string, string> = { police: 'Police', dpp: 'DPP', courts: 'Courts', lawyers: 'Lawyers', prisons: 'Prisons' }
type Draft = { organizationId: string; application: (typeof APPLICATIONS)[number]; seats: number; months: number; note: string; requestId?: string }


function RouteComponent() {
  const { licences, requests, institutions } = Route.useLoaderData()
  const router = useRouter()
  const [draft, setDraft] = useState<Draft | null>(null)
  const [key, setKey] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const open = requests.filter((r) => r.status === 'open')

  const issue = async () => {
    if (!draft) return
    setBusy(true)
    try {
      const result = await issueLicence({ data: { ...draft, note: draft.note || undefined } })
      setDraft(null)
      setKey(result.key)
      void router.invalidate()
    } catch (e) {
      t.error(e instanceof Error ? e.message : 'That did not work.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <article className="container flex flex-col gap-8 py-10 md:max-w-5xl">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1>Licences</h1>
          <p className="text-muted-foreground">Issued by hand until online payment opens. A key is shown once.</p>
        </div>
        <Button disabled={institutions.length === 0} onClick={() => setDraft({ organizationId: institutions[0]?.id ?? '', application: 'police', seats: 1, months: 12, note: '' })}>
          Issue a licence
        </Button>
      </header>

      {open.length > 0 && (
        <Group title={`Requests (${open.length})`}>
          {open.map((r) => (
            <GroupRow
              key={r.id}
              label={`${r.institution}: Pleadli ${appName[r.application]}, ${r.seats} ${r.seats === 1 ? 'computer' : 'computers'}`}
              detail={r.message ?? new Date(r.createdAt).toLocaleDateString()}
              value={
                <span className="flex gap-1.5">
                  <Button size="xs" onClick={() => setDraft({ organizationId: r.organizationId, application: r.application as Draft['application'], seats: r.seats, months: 12, note: '', requestId: r.id })}>
                    Issue
                  </Button>
                  <Button
                    size="xs"
                    variant="ghost"
                    onClick={async () => {
                      await closeLicenceRequest({ data: { requestId: r.id, status: 'declined' } })
                      void router.invalidate()
                    }}
                  >
                    Decline
                  </Button>
                </span>
              }
            />
          ))}
        </Group>
      )}

      <Group title="Licences">
        {licences.length === 0 && <GroupRow label="No licences yet" />}
        {licences.map((l) => {
          const ended = l.status !== 'active' || new Date(l.expiresAt).getTime() < Date.now()
          return (
            <GroupRow
              key={l.id}
              label={`${l.institution}: Pleadli ${appName[l.application]}`}
              detail={`${l.used} of ${l.seats} computers · until ${new Date(l.expiresAt).toLocaleDateString()} · key ending ${l.keyHint}${l.status === 'revoked' ? ' · revoked' : ''}`}
              value={
                !ended ? (
                  <Button
                    size="xs"
                    variant="ghost"
                    onClick={async () => {
                      await revokeLicence({ data: { licenceId: l.id } })
                      t.success('Revoked')
                      void router.invalidate()
                    }}
                  >
                    Revoke
                  </Button>
                ) : (
                  <span className="text-muted-foreground">{l.status === 'revoked' ? 'Revoked' : 'Ended'}</span>
                )
              }
            />
          )
        })}
      </Group>

      <Dialog open={!!draft} onOpenChange={(o) => !o && setDraft(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Issue a licence</DialogTitle>
            <DialogDescription>For an approved institution or practice.</DialogDescription>
          </DialogHeader>
          {draft && (
            <div className="flex flex-col gap-3">
              <label className="flex flex-col gap-1.5 text-sm">
                Institution
                <NativeSelect value={draft.organizationId} onChange={(e) => setDraft({ ...draft, organizationId: e.target.value })}>
                  {institutions.map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.name}
                    </option>
                  ))}
                </NativeSelect>
              </label>
              <label className="flex flex-col gap-1.5 text-sm">
                App
                <NativeSelect value={draft.application} onChange={(e) => setDraft({ ...draft, application: e.target.value as Draft['application'] })}>
                  {APPLICATIONS.map((a) => (
                    <option key={a} value={a}>
                      Pleadli {appName[a]}
                    </option>
                  ))}
                </NativeSelect>
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="flex flex-col gap-1.5 text-sm">
                  Computers
                  <Input type="number" min={1} value={draft.seats} onChange={(e) => setDraft({ ...draft, seats: Number(e.target.value) || 1 })} />
                </label>
                <label className="flex flex-col gap-1.5 text-sm">
                  Months
                  <Input type="number" min={1} max={60} value={draft.months} onChange={(e) => setDraft({ ...draft, months: Number(e.target.value) || 12 })} />
                </label>
              </div>
              <label className="flex flex-col gap-1.5 text-sm">
                Note (agreement, invoice)
                <Input value={draft.note} onChange={(e) => setDraft({ ...draft, note: e.target.value })} />
              </label>
              <Button disabled={busy || !draft.organizationId} onClick={issue}>
                Issue
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!key} onOpenChange={(o) => !o && setKey(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>The licence key</DialogTitle>
            <DialogDescription>Give it to the institution now. It is not shown again; only its last four characters are kept.</DialogDescription>
          </DialogHeader>
          <p className="rounded-xl bg-muted p-4 text-center font-mono text-lg tracking-wider select-all">{key}</p>
          <Button
            onClick={() => {
              void navigator.clipboard.writeText(key ?? '')
              t.success('Copied')
            }}
          >
            Copy
          </Button>
        </DialogContent>
      </Dialog>
    </article>
  )
}
