import { listComputersStaff } from '@/functions/staff.func'
import { DAY, TRIAL_DAYS } from '@/lib/orchestra'
import { Group, GroupRow } from '@pleadli/ui/grouped'
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/_protected/admin/computers')({
  loader: () => listComputersStaff(),
  component: RouteComponent,
})

const appName: Record<string, string> = { police: 'Police', dpp: 'DPP', courts: 'Courts', lawyers: 'Lawyers', prisons: 'Prisons' }

/** Every computer that has run a Pleadli app and reported in, newest first.
 * Known only by a hash of its machine identifier, never the identifier. */
function RouteComponent() {
  const rows = Route.useLoaderData()
  const now = Date.now()
  return (
    <article className="container flex flex-col gap-6 py-10 md:max-w-5xl">
      <header>
        <h1>Computers</h1>
        <p className="text-muted-foreground">Each computer running a Pleadli app, by when it was last seen.</p>
      </header>
      {rows.length === 0 ? (
        <p className="rounded-xl bg-muted/40 p-6 text-center text-muted-foreground">No computer has reported yet. The apps begin reporting when their Orchestra update is released.</p>
      ) : (
        <Group>
          {rows.map((c) => {
            const trialLeft = Math.ceil((c.trialStartedAt.getTime() + TRIAL_DAYS * DAY - now) / DAY)
            const state = c.licenceId ? 'Licensed' : trialLeft > 0 ? `Trial, ${trialLeft} days left` : 'Trial ended'
            return (
              <GroupRow
                key={c.id}
                label={`Pleadli ${appName[c.application] ?? c.application}${c.institution ? ` · ${c.institution}` : ''}`}
                detail={[c.version && `v${c.version}`, c.os, c.country, state, <span key="h" className="font-mono">{c.deviceHash.slice(0, 10)}</span>].filter(Boolean).reduce<React.ReactNode[]>((acc, part, i) => (i ? [...acc, ' · ', part] : [part]), [])}
                value={new Date(c.lastSeenAt).toLocaleDateString()}
              />
            )
          })}
        </Group>
      )}
    </article>
  )
}
