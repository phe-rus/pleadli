import { getStaffOverview } from '@/functions/staff.func'
import { Group, GroupRow } from '@pleadli/ui/grouped'
import { Stat } from '@pleadli/ui/stat'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'

export const Route = createFileRoute('/_protected/admin/')({
  loader: () => getStaffOverview(),
  component: RouteComponent,
})

const appName: Record<string, string> = { police: 'Police', dpp: 'DPP', courts: 'Courts', lawyers: 'Lawyers', prisons: 'Prisons' }

/** What staff look at first: who is waiting for review, what needs an answer,
 * and how many computers run Pleadli. */
function RouteComponent() {
  const o = Route.useLoaderData()
  const navigate = useNavigate()
  return (
    <article className="container flex flex-col gap-8 py-10 md:max-w-5xl">
      <header>
        <h1>Overview</h1>
        <p className="text-muted-foreground">Pleadli Orchestra today.</p>
      </header>

      {o.waiting.length > 0 && (
        <Group title={`Waiting for review (${o.waiting.length})`}>
          {o.waiting.slice(0, 6).map((w) => (
            <GroupRow
              key={w.id}
              label={w.name}
              detail={[w.kind === 'practice' ? 'Practice' : 'Institution', appName[w.institutionType] ?? w.institutionType, w.country].join(' · ')}
              value={w.requestedAt ? new Date(w.requestedAt).toLocaleDateString() : undefined}
              chevron
              onClick={() => void navigate({ to: '/admin/institutions', search: { open: w.id } as never })}
            />
          ))}
        </Group>
      )}

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Institutions" value={o.institutions.active} hint={`${o.institutions.practices} practices`} />
        <Stat label="Licences active" value={o.licences.active} hint={o.licences.expiringSoon ? `${o.licences.expiringSoon} end within 30 days` : undefined} tone={o.licences.expiringSoon ? 'attention' : 'plain'} />
        <Stat label="Licence requests" value={o.openRequests} tone={o.openRequests ? 'attention' : 'plain'} onClick={() => void navigate({ to: '/admin/licences' })} />
        <Stat label="Reports to answer" value={o.openReports} hint={o.crashes ? `${o.crashes} crashes` : undefined} tone={o.crashes ? 'urgent' : o.openReports ? 'attention' : 'plain'} onClick={() => void navigate({ to: '/admin/reports' })} />
      </section>

      <section className="flex flex-col gap-3">
        <h2>Computers running Pleadli</h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat label="Today" value={o.computers.today} />
          <Stat label="This week" value={o.computers.week} />
          <Stat label="This month" value={o.computers.month} />
          <Stat label="Ever" value={o.computers.total} />
        </div>
        <Group title="By app, this month">
          {Object.entries(o.computers.byApp).map(([app, n]) => (
            <GroupRow key={app} label={`Pleadli ${appName[app]}`} value={String(n)} />
          ))}
        </Group>
      </section>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <Stat label="Trials running" value={o.trials.running} />
        <Stat label="Trials ended, no licence" value={o.trials.ended} tone={o.trials.ended ? 'attention' : 'plain'} />
        <Stat label="Failed backups this week" value={o.failedBackups} tone={o.failedBackups ? 'urgent' : 'plain'} />
      </section>

      <section className="flex flex-col gap-3">
        <h2>Papers and cases followed</h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat label="Papers this month" value={o.papers.month} hint={`${o.papers.total} ever`} />
          <Stat label="With a PDF to compare" value={o.papers.withPdf} />
          <Stat label="Withdrawn" value={o.papers.withdrawn} />
          <Stat label="Cases followed" value={o.tracked.total} hint={`${o.tracked.month} updated this month`} />
        </div>
      </section>

      <p className="text-sm text-muted-foreground">
        Computers and backups appear once the apps report to the Orchestra; see <Link to="/admin/computers" className="text-primary">Computers</Link>.
      </p>
    </article>
  )
}
