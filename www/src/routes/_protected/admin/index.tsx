import { Group, GroupRow } from '@pleadli/ui/grouped'
import { Stat } from '@pleadli/ui/stat'
import { createFileRoute, getRouteApi, Link, useNavigate } from '@tanstack/react-router'

export const Route = createFileRoute('/_protected/admin/')({
  component: RouteComponent,
})

const appName: Record<string, string> = { police: 'Police', dpp: 'DPP', courts: 'Courts', lawyers: 'Lawyers', prisons: 'Prisons' }

/** What staff look at first: who is waiting for review, what needs an answer,
 * and how many computers run Pleadli. */
function RouteComponent() {
  const o = getRouteApi('/_protected/admin').useLoaderData()
  const attention: { key: string; text: string; to: string }[] = []
  if (o.waiting.length) attention.push({ key: 'w', text: `Institutions waiting for review: ${o.waiting.length}`, to: '/admin/institutions' })
  if (o.openRequests) attention.push({ key: 'r', text: `Licence requests to answer: ${o.openRequests}`, to: '/admin/licences' })
  if (o.crashes) attention.push({ key: 'c', text: `Crashes reported: ${o.crashes}`, to: '/admin/reports' })
  if (o.openReports) attention.push({ key: 'p', text: `Reports to answer: ${o.openReports}`, to: '/admin/reports' })
  if (o.failedBackups) attention.push({ key: 'b', text: `Failed backups this week: ${o.failedBackups}`, to: '/admin/computers' })
  if (o.licences.expiringSoon) attention.push({ key: 'l', text: `Licences ending within 30 days: ${o.licences.expiringSoon}`, to: '/admin/licences' })
  const navigate = useNavigate()
  return (
    <article className="container flex flex-col gap-8 py-10 md:max-w-5xl">
      <header>
        <h1>Overview</h1>
        <p className="text-muted-foreground">Pleadli Orchestra today.</p>
      </header>

      <Group title="Needs your attention">
        {attention.length ? attention.map((a) => (
          <GroupRow key={a.key} label={a.text} chevron render={({ className, children }) => <Link to={a.to as never} className={className}>{children}</Link>} />
        )) : <GroupRow label="Nothing is waiting. All answered." />}
      </Group>

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
